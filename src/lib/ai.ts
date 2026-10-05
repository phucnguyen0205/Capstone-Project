/**
 * AI Service — Powered by Google Gemini
 *
 * Uses Gemini 2.0 Flash (free tier) for:
 * 1. Content Moderation — analyze caption + image for unsafe content
 * 2. User Compatibility Ranking — Tinder-style match scoring
 *
 * Falls back to rule-based engine if Gemini is unavailable.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-1.5-flash";

// ─── Rule-based engine (always runs first, free & instant) ─────────────────

const PROFANITY_LIST = [
  // Vietnamese profanity
  "địt", "lồn", "cặc", "cặk", "buồi", "đụ", "đéo", "dm", "vk", "vc",
  "đmm", "cc", "vkl", "vl", "đm", "bố", "mẹ kiếp", "ngu", "nguồi", "nguỵ",
  "ngụy", "thằng", "con", "bướm", "cave", "đổ", "nghiện",
  // Drugs / illegal
  "ma túy", "thuốc phiện", "cần sa", "cocaine", "heroin", "meth", "weed",
  // English profanity
  "fuck", "shit", "bitch", "asshole", "bastard", "nigger", "slut", "whore",
  "dick", "pussy", "cunt", "niggaz", "faggot",
];

const PHONE_REGEX =
  /(?:(?:\+?84|0)[3-9]\d{8}|(?:(?:\+?84|0)[2]\d{8,9}))/g;
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EXCESSIVE_CAPS_REGEX = /^[A-ZÀ-Ỹ\s]{20,}$/;
const SPAM_CHARS_REGEX = /(.)\1{6,}/;
const PHISHING_PATTERNS = [
  /login.*\.tk/i, /signin.*\.xyz/i, /free.*coin/i,
  /airdrop.*\.io/i, /\.ru\//i, /bit\.ly\//i,
  /password.*reset/i, /account.*verify/i,
];

export interface CaptionCheckResult {
  safe: boolean;
  reason?: string;
  score: number; // 0-100; ≤ 70 = flagged
}

export function checkCaption(text: string): CaptionCheckResult {
  if (!text?.trim()) return { safe: true, score: 100 };

  const lower = text.toLowerCase();
  let penalty = 0;
  let reason: string | undefined;

  for (const word of PROFANITY_LIST) {
    if (lower.includes(word)) {
      penalty += 40;
      reason = "Nội dung không phù hợp (từ cấm)";
      break;
    }
  }

  if (PHONE_REGEX.test(text)) {
    penalty += 30;
    reason = reason ?? "Phát hiện số điện thoại trong nội dung";
  }
  if (EMAIL_REGEX.test(text)) {
    penalty += 20;
    reason = reason ?? "Phát hiện email trong nội dung";
  }

  const links = (text.match(/(https?:\/\/[^\s]+)/gi) ?? []).length;
  if (links >= 4) {
    penalty += 35;
    reason = reason ?? "Phát hiện spam liên kết";
  }

  for (const pat of PHISHING_PATTERNS) {
    if (pat.test(text)) {
      penalty += 50;
      reason = "Phát hiện nội dung đáng ngờ (phishing)";
      break;
    }
  }

  if (EXCESSIVE_CAPS_REGEX.test(text)) {
    penalty += 10;
    reason = reason ?? "Phát hiện VIẾT HOA quá mức";
  }

  if (SPAM_CHARS_REGEX.test(text)) {
    penalty += 15;
    reason = reason ?? "Phát hiện spam ký tự lặp";
  }

  if (text.trim().length > 2000) penalty += 10;

  const score = Math.max(0, 100 - penalty);
  return { safe: penalty <= 30, reason, score };
}

// ─── Gemini Moderation ────────────────────────────────────────────────────────

export interface GeminiModerationResult {
  flagged: boolean;
  reason?: string;
  categories: {
    hate: boolean;
    harassment: boolean;
    violence: boolean;
    sexual: boolean;
    selfHarm: boolean;
    political: boolean;
    dangerous: boolean;
  };
  geminiScore: number; // 0-100 confidence that content is safe
  method: "gemini" | "rule";
}

const MODERATION_PROMPT = `Content moderation. Return ONLY valid JSON:
{"safe":true,"reason":"","categories":{"hate":false,"harassment":false,"violence":false,"sexual":false,"self_harm":false},"score":100}
Caption: "{caption}"
JSON:`;

async function callGemini(
  prompt: string,
  maxTokens = 300,
  retries = 1,
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: maxTokens,
              response_mime_type: "application/json",
            },
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        // 429 = quota exceeded — log and bail (retrying won't help).
        // 5xx / network blips → retry once after a short delay.
        if (res.status === 429) {
          console.warn(`[Gemini] Quota exceeded. Falling back to rule-based. Retry in 60s.`);
          return null;
        }
        if (res.status >= 500 && attempt < retries) {
          lastError = `Gemini ${res.status}`;
          console.warn(`[Gemini] Transient ${res.status}, retrying in ${attempt + 1}s...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.error(`[Gemini] API error ${res.status}: ${errText.slice(0, 200)}`);
        return null;
      }
      const data = (await res.json()) as any;
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          const jsonStart = part.text.indexOf("{");
          if (jsonStart >= 0) return part.text.slice(jsonStart);
        }
      }
      return null;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        console.warn(`[Gemini] Network error, retrying in ${attempt + 1}s:`, lastError);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error("[Gemini] Request failed after retries:", err);
      return null;
    }
  }
  console.error("[Gemini] All attempts failed. Last error:", lastError);
  return null;
}

export async function moderateWithGemini(
  caption: string,
  imageUrl?: string
): Promise<GeminiModerationResult | null> {
  if (!GEMINI_API_KEY) return null;

  // Build the prompt — include image context if available
  let fullPrompt = MODERATION_PROMPT.replace("{caption}", caption || "(no caption)");
  if (imageUrl) {
    fullPrompt += `\n\nImage URL: ${imageUrl}\n(Note: image content analysis is limited via API. Check URL domain and pattern as additional signal.)`;
  }

  const text = await callGemini(fullPrompt, 500);
  if (!text) return null;

  try {
    // Strip any markdown fences
    const cleaned = text.replace(/```json\n?|```\n?/gi, "").trim();
    const parsed = JSON.parse(cleaned) as {
      safe: boolean;
      reason?: string;
      categories?: Record<string, boolean>;
      score?: number;
    };

    const categories = {
      hate: parsed.categories?.hate ?? false,
      harassment: parsed.categories?.harassment ?? false,
      violence: parsed.categories?.violence ?? false,
      sexual: parsed.categories?.sexual ?? false,
      selfHarm: parsed.categories?.self_harm ?? false,
      political: parsed.categories?.political ?? false,
      dangerous: parsed.categories?.dangerous ?? false,
    };

    const flaggedCategories = Object.entries(categories)
      .filter(([, v]) => v)
      .map(([k]) => k);

    return {
      flagged: !parsed.safe,
      reason: flaggedCategories.length > 0
        ? `Vi phạm: ${flaggedCategories.join(", ")}`
        : parsed.reason,
      categories,
      geminiScore: parsed.score ?? 50,
      method: "gemini",
    };
  } catch (err) {
    console.error("[Gemini] Parse error:", err, "Raw:", text.slice(0, 200));
    return null;
  }
}

// ─── Combined moderation pipeline ──────────────────────────────────────────────

export interface FullModerationResult {
  passed: boolean;
  reason?: string;
  ruleScore: number;
  geminiFlagged: boolean;
  geminiScore: number;
  method: "gemini" | "rule";
  categories?: GeminiModerationResult["categories"];
}

export async function moderateContent(
  caption: string,
  imageUrl?: string
): Promise<FullModerationResult> {
  // Step 1: Rule-based (always runs, instant, free)
  const rule = checkCaption(caption);

  // Step 2: Gemini (if API key available)
  const gemini = await moderateWithGemini(caption, imageUrl);

  if (gemini) {
    // Gemini returns `flagged: true` when the model decided the
    // content violates a category. We also treat a low safety score
    // (< 50) as a soft-block.
    const blocked = gemini.flagged || (gemini.geminiScore < 50);
    return {
      passed: !blocked,
      reason: blocked ? (gemini.reason ?? "Nội dung không phù hợp") : undefined,
      ruleScore: rule.score,
      geminiFlagged: gemini.flagged,
      geminiScore: gemini.geminiScore,
      method: "gemini",
      categories: gemini.categories,
    };
  }

  // Fallback: rule-based only
  return {
    passed: rule.score > 70,
    reason: rule.score <= 70 ? rule.reason : undefined,
    ruleScore: rule.score,
    geminiFlagged: false,
    geminiScore: rule.score,
    method: "rule",
  };
}

// ─── Gemini-powered User Ranking ──────────────────────────────────────────────

const RANKING_PROMPT = `Rate user compatibility (0-100) for a social app. Return ONLY JSON:
{"score":0-100,"tier":"super|high|medium|low","reasons":["reason1"],"breakdown":{"avatar":0-20,"bio":0-15,"hobbies":0-20,"online":0-10,"mutualFriends":0-15,"freshness":0-10,"distance":0-10}}
Rules: avatar=20 if exists; bio=15 if >100 chars; hobbies=Jaccard×20; online=10 if on; mutualFriends=scaled; freshness=10 if <7d; distance=10 if <2km.
Me: {myProfile}
Them: {theirProfile}
JSON:`;

export interface UserProfile {
  id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  bio: string | null;
  hobbies: string | null;
  occupation: string | null;
  gender: string | null;
  relationshipStatus: string | null;
  isOnline: boolean;
  lastActiveAt: number | null;
  createdAt: number;
  mutualFriendCount?: number;
  distanceKm?: number;
}

export interface RankingResult {
  userId: string;
  score: number;
  tier: "super" | "high" | "medium" | "low";
  reasons: string[];
  breakdown: {
    avatar: number;
    bio: number;
    hobbies: number;
    online: number;
    mutualFriends: number;
    freshness: number;
    distance: number;
  };
  method: "gemini" | "rule";
}

function tokenize(text: string | null): Set<string> {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 2)
  );
}

function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function ruleBasedCompatibility(me: UserProfile, them: UserProfile): RankingResult {
  const breakdown = { avatar: 0, bio: 0, hobbies: 0, online: 0, mutualFriends: 0, freshness: 0, distance: 0 };
  const reasons: string[] = [];

  const hasAvatar = !!them.avatar;
  breakdown.avatar = hasAvatar ? 20 : 0;
  if (hasAvatar) reasons.push("Có ảnh đại diện");

  const bioLen = (them.bio ?? "").trim().length;
  if (bioLen > 100) { breakdown.bio = 15; reasons.push("Bio chi tiết"); }
  else if (bioLen > 30) { breakdown.bio = 10; reasons.push("Có bio"); }
  else if (bioLen > 0) { breakdown.bio = 5; }

  const hobbySim = jaccardSim(tokenize(me.hobbies), tokenize(them.hobbies));
  breakdown.hobbies = Math.round(hobbySim * 20);
  if (hobbySim > 0.5) reasons.push("Cùng sở thích");

  breakdown.online = them.isOnline ? 10 : 0;
  if (them.isOnline) reasons.push("Đang online");

  const mutual = them.mutualFriendCount ?? 0;
  if (mutual >= 5) { breakdown.mutualFriends = 15; reasons.push(`${mutual} bạn chung`); }
  else if (mutual >= 2) { breakdown.mutualFriends = Math.round((mutual / 5) * 15); reasons.push(`${mutual} bạn chung`); }

  const daysSinceJoin = (Date.now() / 1000 - them.createdAt) / 86400;
  if (daysSinceJoin < 7) { breakdown.freshness = 10; reasons.push("Tài khoản mới"); }
  else if (daysSinceJoin < 30) breakdown.freshness = 7;
  else if (daysSinceJoin < 90) breakdown.freshness = 4;
  else breakdown.freshness = 1;

  const distKm = them.distanceKm ?? (() => {
    let hash = 0;
    for (let i = 0; i < them.id.length; i++) hash = (hash * 31 + them.id.charCodeAt(i)) & 0x7fffffff;
    return (hash % 100) / 10 + 0.5;
  })();

  if (distKm <= 2) { breakdown.distance = 10; reasons.push("Rất gần bạn"); }
  else if (distKm <= 10) { breakdown.distance = 7; reasons.push("Gần bạn"); }
  else if (distKm <= 30) breakdown.distance = 4;

  const totalScore = Math.min(100,
    breakdown.avatar + breakdown.bio + breakdown.hobbies +
    breakdown.online + breakdown.mutualFriends + breakdown.freshness + breakdown.distance
  );

  const tier: RankingResult["tier"] =
    totalScore >= 80 ? "super" :
    totalScore >= 65 ? "high" :
    totalScore >= 45 ? "medium" : "low";

  return { userId: them.id, score: totalScore, tier, reasons, breakdown, method: "rule" };
}

function parseRankingResponse(text: string, them: UserProfile, ruleResult: RankingResult): RankingResult | null {
  try {
    const cleaned = text.replace(/```json\n?|```\n?/gi, "").trim();
    const parsed = JSON.parse(cleaned) as {
      score?: number;
      tier?: string;
      reasons?: string[];
      breakdown?: Partial<RankingResult["breakdown"]>;
    };

    if (typeof parsed.score !== "number") return null;

    const tierMap: Record<string, RankingResult["tier"]> = {
      super: "super", high: "high", medium: "medium", low: "low",
    };

    return {
      userId: them.id,
      score: Math.min(100, Math.max(0, parsed.score)),
      tier: tierMap[parsed.tier ?? ""] ?? ruleResult.tier,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 5) : ruleResult.reasons,
      breakdown: {
        ...ruleResult.breakdown,
        ...(parsed.breakdown ?? {}),
      } as RankingResult["breakdown"],
      method: "gemini",
    };
  } catch {
    return null;
  }
}

function buildProfileText(p: UserProfile): string {
  return [
    `name: ${p.name ?? p.username}`,
    `username: @${p.username}`,
    p.avatar ? "avatar: YES" : "avatar: NO",
    `bio: ${p.bio ?? "(empty)"}`,
    `hobbies: ${p.hobbies ?? "(none)"}`,
    `occupation: ${p.occupation ?? "(none)"}`,
    `gender: ${p.gender ?? "(not set)"}`,
    `relationship: ${p.relationshipStatus ?? "(not set)"}`,
    p.isOnline ? "status: ONLINE NOW" : "status: OFFLINE",
    `mutual_friends: ${p.mutualFriendCount ?? 0}`,
    `joined_days_ago: ${Math.floor((Date.now() / 1000 - p.createdAt) / 86400)}`,
  ].join("\n");
}

export async function computeCompatibility(
  me: UserProfile,
  them: UserProfile
): Promise<RankingResult> {
  const ruleResult = ruleBasedCompatibility(me, them);

  if (!GEMINI_API_KEY) return ruleResult;

  const prompt = RANKING_PROMPT
    .replace("{myProfile}", buildProfileText(me))
    .replace("{theirProfile}", buildProfileText(them));

  const text = await callGemini(prompt, 600);
  if (!text) return ruleResult;

  const geminiResult = parseRankingResponse(text, them, ruleResult);
  return geminiResult ?? ruleResult;
}
