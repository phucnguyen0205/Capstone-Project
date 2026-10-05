"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import {
  VaultNoteDetailModal,
  type VaultNoteDetail,
} from "@/components/groups/VaultNoteDetailModal";
import type { AssetKey } from "@/lib/assets";

// ── Types ──────────────────────────────────────────────────────────────────

type Mood = "happy" | "sad" | "angry" | "neutral";

interface VaultNote {
  id: string;
  content: string;
  mood: Mood;
  createdAt: number;
  updatedAt: number;
  /** Per-note threshold (NULL → use global mirror_settings.video_unlock_points). */
  unlockPoints: number | null;
  /** "private" = owner-only. "shared" = visible to friends per the visibility rules. */
  visibility: "private" | "shared";
}

interface VaultStats {
  total: number;
  thisWeek: number;
  positiveRatio: number;
}

/** A note shared by someone else that the viewer is allowed to read. */
interface SharedVaultItem extends VaultNote {
  author: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
  closenessPoints: number;
  effectiveUnlock: number;
  /** How many more points the viewer needs to unlock this note.
   *  Always 0 when `locked` is false. */
  pointsToUnlock: number;
  override: "allowed" | "denied" | null;
  moodFiltered: boolean;
  /** True when the points check blocks the viewer. The card renders a
   *  blur + lock overlay and the content is intentionally hidden. */
  locked: boolean;
}

/** Friend row used by the visibility picker. */
interface FriendRow {
  user: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
    bio: string | null;
  };
  points: number;
}

/**
 * Per-note allow/deny override returned by the visibility endpoint.
 * `moodFilter` is the comma-separated list of moods this override
 * applies to. NULL/undefined means "all moods".
 */
interface VisibilityOverride {
  userId: string;
  state: "allowed" | "denied";
  moodFilter?: string | null;
  createdAt: number;
  user: { username: string; name: string | null; avatar: string | null };
}

/** Single edit entry the visibility modal tracks locally. */
interface VisibilityEntry {
  userId: string;
  state: "allowed" | "denied";
  moodFilter: Mood[]; // empty array = "all moods"
}

/** Server projection of "who will see this note?" — used by the preview panel. */
interface VisibilityPreviewResponse {
  noteId: string;
  noteMood: Mood;
  effectiveUnlock: number;
  totals: {
    friends: number;
    willSee: number;
    willNotSee: number;
  };
  buckets: {
    allowedByPoints: PreviewUser[];
    explicitAllowed: PreviewUser[];
    explicitDenied: PreviewUser[];
    hiddenByPoints: PreviewUser[];
  };
}

interface PreviewUser {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  closenessPoints: number;
  moodFiltered?: boolean;
}

// ── Mood config (visual) ───────────────────────────────────────────────────

const ALL_MOODS: Mood[] = ["happy", "sad", "angry", "neutral"];

const moodConfig: Record<
  Mood,
  {
    bg: string;
    border: string;
    text: string;
    icon: AssetKey;
    label: string;
    short: string;
  }
> = {
  happy: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    icon: "smile",
    label: "Vui vẻ",
    short: "Vui",
  },
  sad: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    icon: "eyeOff",
    label: "Buồn",
    short: "Buồn",
  },
  angry: {
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    text: "text-red-400",
    icon: "shieldAlert",
    label: "Tức giận",
    short: "Tức",
  },
  neutral: {
    bg: "bg-white/5",
    border: "border-[#232338]",
    text: "text-[#94a3b8]",
    icon: "eye",
    label: "Bình thường",
    short: "Bình thường",
  },
};

// ── HTTP helpers ───────────────────────────────────────────────────────────

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── Root component ─────────────────────────────────────────────────────────

export function VaultMainPanel() {
  // Owner-view state -------------------------------------------------------
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [stats, setStats] = useState<VaultStats>({
    total: 0,
    thisWeek: 0,
    positiveRatio: 0,
  });
  const [newNote, setNewNote] = useState("");
  const [selectedMood, setSelectedMood] = useState<Mood>("neutral");
  const [showAdd, setShowAdd] = useState(false);
  const [filterMood, setFilterMood] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Shared-feed state ------------------------------------------------------
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [shared, setShared] = useState<SharedVaultItem[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [globalDefaultUnlock, setGlobalDefaultUnlock] = useState(60);

  // Visibility editor state -----------------------------------------------
  const [editingNote, setEditingNote] = useState<VaultNote | null>(null);
  const [visibilityEntries, setVisibilityEntries] = useState<VisibilityEntry[]>(
    [],
  );
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilityNote, setVisibilityNote] = useState<VaultNote | null>(null);
  const [unlockInput, setUnlockInput] = useState<string>("");
  const [visibilityPickerTab, setVisibilityPickerTab] = useState<
    "allowed" | "denied"
  >("allowed");
  const [visibilitySearch, setVisibilitySearch] = useState("");
  const [preview, setPreview] = useState<VisibilityPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Detail modal (clicking an unlocked shared note) -----------------------
  // The shared feed is the read-only browse surface; clicking an
  // unlocked note opens a focused modal that shows the full content
  // and the unlock metadata. Locked notes don't open — they only show
  // a hover tooltip with the points needed.
  const [openNote, setOpenNote] = useState<VaultNoteDetail | null>(null);

  // ── Load owner notes ────────────────────────────────────────────────────
  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault/notes", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{ notes: VaultNote[]; stats: VaultStats }>(
        res,
      );
      if (data?.notes) setNotes(data.notes);
      if (data?.stats) setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load shared feed ───────────────────────────────────────────────────
  const loadShared = useCallback(async () => {
    setSharedLoading(true);
    try {
      const res = await fetch("/api/vault/feed", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{
        items: SharedVaultItem[];
        globalDefaultUnlock: number;
      }>(res);
      if (data?.items) setShared(data.items);
      if (typeof data?.globalDefaultUnlock === "number") {
        setGlobalDefaultUnlock(data.globalDefaultUnlock);
      }
    } finally {
      setSharedLoading(false);
    }
  }, []);

  // ── Load friend list for the visibility picker ────────────────────────
  const loadFriends = useCallback(async () => {
    const res = await fetch("/api/vault/friends", {
      credentials: "include",
      cache: "no-store",
    });
    const data = await safeJson<{ items: FriendRow[] }>(res);
    if (data?.items) setFriends(data.items);
  }, []);

  useEffect(() => {
    loadNotes();
    loadShared();
    loadFriends();
  }, [loadNotes, loadShared, loadFriends]);

  // ── Add note (now with optional unlockPoints + visibility) ─────────────
  async function handleAddNote() {
    if (!newNote.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        content: newNote.trim(),
        mood: selectedMood,
        visibility: "shared",
      };
      if (unlockInput.trim()) {
        const n = parseInt(unlockInput, 10);
        if (!Number.isFinite(n) || n < 0 || n > 1000) {
          throw new Error("Điểm thân thiết yêu cầu phải trong khoảng 0–1000");
        }
        body.unlockPoints = n;
      }
      const res = await fetch("/api/vault/notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson<{ error?: string; id?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error ?? "Lưu thất bại");
      }
      setNewNote("");
      setSelectedMood("neutral");
      setUnlockInput("");
      setShowAdd(false);
      await loadNotes();
    } catch (e: any) {
      setError(e?.message ?? "Lưu thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      const res = await fetch(`/api/vault/notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) await loadNotes();
      else await loadNotes();
    } catch {
      await loadNotes();
    }
  }

  // ── Visibility editor ───────────────────────────────────────────────────

  async function openVisibilityEditor(note: VaultNote) {
    setEditingNote(note);
    setVisibilityError(null);
    setVisibilitySearch("");
    setVisibilityPickerTab("allowed");
    setPreview(null);
    try {
      const res = await fetch(
        `/api/vault/notes/${encodeURIComponent(note.id)}/visibility`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await safeJson<{
        unlockPoints: number | null;
        visibility: string;
        overrides: VisibilityOverride[];
      }>(res);
      if (data) {
        setVisibilityEntries(
          data.overrides.map((o) => ({
            userId: o.userId,
            state: o.state,
            moodFilter: o.moodFilter
              ? (o.moodFilter.split(",").filter((m) =>
                  ALL_MOODS.includes(m as Mood),
                ) as Mood[])
              : [],
          })),
        );
        setVisibilityNote({
          ...note,
          unlockPoints: data.unlockPoints,
          visibility: data.visibility as VaultNote["visibility"],
        });
        setUnlockInput(
          data.unlockPoints == null ? "" : String(data.unlockPoints),
        );
      }
    } catch {
      /* ignore */
    }
  }

  function closeVisibilityEditor() {
    setEditingNote(null);
    setVisibilityNote(null);
    setVisibilityEntries([]);
    setVisibilityError(null);
    setUnlockInput("");
    setPreview(null);
  }

  /** Add or update an override entry for (userId, state, moodFilter).
   *  When `moodFilter` is `null` we replace any existing entry for the
   *  same (userId, state) — this is how "blanket" overrides work. */
  function setOverride(
    userId: string,
    state: "allowed" | "denied",
    moodFilter: Mood[] | null,
  ) {
    setVisibilityEntries((prev) => {
      // Remove any previous entry for (userId, state). This lets a
      // blanket entry be replaced by a mood-filtered one (or vice
      // versa) without duplicates.
      const others = prev.filter(
        (e) => !(e.userId === userId && e.state === state),
      );
      if (moodFilter === null) {
        // null = "remove", not "blanket" — explicit removal vs no
        // override. We represent no override as "no entry at all".
        return others;
      }
      return [...others, { userId, state, moodFilter }];
    });
  }

  /** Toggle one mood in/out of an existing override's moodFilter. */
  function toggleMoodFilter(userId: string, state: "allowed" | "denied", mood: Mood) {
    setVisibilityEntries((prev) => {
      const existing = prev.find(
        (e) => e.userId === userId && e.state === state,
      );
      const others = prev.filter(
        (e) => !(e.userId === userId && e.state === state),
      );
      const currentMoods = existing?.moodFilter ?? [];
      const has = currentMoods.includes(mood);
      const nextMoods = has
        ? currentMoods.filter((m) => m !== mood)
        : [...currentMoods, mood];
      if (nextMoods.length === 0) {
        // 0 moods = "all moods" — we represent that as an empty
        // array, which the server normalises to NULL ("applies to
        // every mood").
        return [...others, { userId, state, moodFilter: [] }];
      }
      return [...others, { userId, state, moodFilter: nextMoods }];
    });
  }

  /** Quickly add a blanket allow/deny for a friend. */
  function addBlanketOverride(userId: string, state: "allowed" | "denied") {
    setOverride(userId, state, []);
  }

  /** Remove any allow override AND any deny override for a friend. */
  function clearAllOverrides(userId: string) {
    setVisibilityEntries((prev) => prev.filter((e) => e.userId !== userId));
  }

  async function saveVisibility() {
    if (!editingNote) return;
    setVisibilitySaving(true);
    setVisibilityError(null);
    try {
      const unlock =
        unlockInput.trim() === ""
          ? null
          : Math.max(0, Math.min(1000, parseInt(unlockInput, 10) || 0));

      // PATCH note fields
      const noteRes = await fetch(
        `/api/vault/notes/${encodeURIComponent(editingNote.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unlockPoints: unlock,
            visibility: visibilityNote?.visibility ?? "shared",
          }),
        },
      );
      if (!noteRes.ok) {
        const data = await safeJson<{ error?: string }>(noteRes);
        throw new Error(data?.error ?? "Không lưu được");
      }

      // PUT overrides (with moodFilter)
      const visRes = await fetch(
        `/api/vault/notes/${encodeURIComponent(editingNote.id)}/visibility`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: visibilityEntries.map((e) => ({
              userId: e.userId,
              state: e.state,
              moodFilter:
                e.moodFilter.length === 0
                  ? null
                  : Array.from(new Set(e.moodFilter)).join(","),
            })),
          }),
        },
      );
      if (!visRes.ok) {
        const data = await safeJson<{ error?: string }>(visRes);
        throw new Error(data?.error ?? "Không lưu được danh sách");
      }
      await loadNotes();
      await loadShared();
      closeVisibilityEditor();
    } catch (e: any) {
      setVisibilityError(e?.message ?? "Lưu thất bại");
    } finally {
      setVisibilitySaving(false);
    }
  }

  /** Fetch the live preview of "who will see this note?". */
  async function loadPreview() {
    if (!editingNote) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/vault/notes/${encodeURIComponent(editingNote.id)}/visibility/preview`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await safeJson<VisibilityPreviewResponse>(res);
      if (data) setPreview(data);
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const filteredNotes =
    filterMood === "all"
      ? notes
      : notes.filter((n) => n.mood === filterMood);

  // Per-friend override status, used to render the picker & note list.
  const overrideByUser = useMemo(() => {
    const map = new Map<
      string,
      { allowed: VisibilityEntry[]; denied: VisibilityEntry[] }
    >();
    for (const e of visibilityEntries) {
      const slot = map.get(e.userId) ?? { allowed: [], denied: [] };
      if (e.state === "allowed") slot.allowed.push(e);
      else slot.denied.push(e);
      map.set(e.userId, slot);
    }
    return map;
  }, [visibilityEntries]);

  const vaultStats = [
    {
      label: "Tổng ghi chú",
      value: stats.total.toString(),
      icon: "layoutGrid" as const,
    },
    {
      label: "Tuần này",
      value: stats.thisWeek.toString(),
      icon: "clock" as const,
    },
    {
      label: "Mood tích cực",
      value: `${stats.positiveRatio}%`,
      icon: "heart" as const,
    },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#16162a] px-6 py-4">
        <h2 className="mb-1 text-lg font-bold text-white">Hộp bí mật</h2>
        <p className="text-sm text-[#626775]">
          Ghi chú riêng tư và những suy nghĩ bạn chia sẻ với bạn thân đủ thân thiết
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-[#16162a] px-6 py-2">
        <button
          onClick={() => setTab("mine")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            tab === "mine"
              ? "bg-[#ff2e93]/10 text-[#ff2e93]"
              : "bg-transparent text-[#94a3b8] hover:text-white"
          }`}
        >
          Của tôi ({stats.total})
        </button>
        <button
          onClick={() => setTab("shared")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            tab === "shared"
              ? "bg-violet-500/15 text-violet-300"
              : "bg-transparent text-[#94a3b8] hover:text-white"
          }`}
        >
          Được chia sẻ ({shared.length})
        </button>
      </div>

      {tab === "mine" ? (
        <OwnerView
          stats={vaultStats}
          notes={filteredNotes}
          loading={loading}
          error={error}
          filterMood={filterMood}
          setFilterMood={setFilterMood}
          showAdd={showAdd}
          setShowAdd={setShowAdd}
          newNote={newNote}
          setNewNote={setNewNote}
          selectedMood={selectedMood}
          setSelectedMood={setSelectedMood}
          unlockInput={unlockInput}
          setUnlockInput={setUnlockInput}
          globalDefaultUnlock={globalDefaultUnlock}
          submitting={submitting}
          onAdd={handleAddNote}
          onDelete={handleDelete}
          onOpenVisibility={openVisibilityEditor}
          overrideByUser={overrideByUser}
          onLoadPreview={loadPreview}
          previewLoading={previewLoading}
        />
      ) : (
        <SharedView
          items={shared}
          loading={sharedLoading}
          globalDefaultUnlock={globalDefaultUnlock}
          onOpen={(it) => {
            if (it.locked) return; // locked notes don't open
            setOpenNote({
              id: it.id,
              content: it.content,
              mood: it.mood,
              createdAt: it.createdAt,
              updatedAt: it.updatedAt,
              author: it.author,
              closenessPoints: it.closenessPoints,
              effectiveUnlock: it.effectiveUnlock,
              override: it.override,
            });
          }}
        />
      )}

      {openNote && (
        <VaultNoteDetailModal
          note={openNote}
          onClose={() => setOpenNote(null)}
        />
      )}

      {/* Visibility editor modal */}
      {editingNote && visibilityNote && (
        <VisibilityEditor
          note={visibilityNote}
          friends={friends}
          entries={visibilityEntries}
          overrideByUser={overrideByUser}
          unlockInput={unlockInput}
          setUnlockInput={setUnlockInput}
          visibility={visibilityNote.visibility}
          setVisibility={(v) =>
            setVisibilityNote({ ...visibilityNote, visibility: v })
          }
          saving={visibilitySaving}
          error={visibilityError}
          search={visibilitySearch}
          setSearch={setVisibilitySearch}
          pickerTab={visibilityPickerTab}
          setPickerTab={setVisibilityPickerTab}
          preview={preview}
          previewLoading={previewLoading}
          onAddBlanket={addBlanketOverride}
          onClearAll={clearAllOverrides}
          onToggleMood={toggleMoodFilter}
          onClose={closeVisibilityEditor}
          onSave={saveVisibility}
          onLoadPreview={loadPreview}
          globalDefaultUnlock={globalDefaultUnlock}
        />
      )}
    </div>
  );
}

// ─── Owner view ────────────────────────────────────────────────────────────

function OwnerView(props: {
  stats: Array<{ label: string; value: string; icon: AssetKey }>;
  notes: VaultNote[];
  loading: boolean;
  error: string | null;
  filterMood: string;
  setFilterMood: (s: string) => void;
  showAdd: boolean;
  setShowAdd: (b: boolean) => void;
  newNote: string;
  setNewNote: (s: string) => void;
  selectedMood: Mood;
  setSelectedMood: (m: Mood) => void;
  unlockInput: string;
  setUnlockInput: (s: string) => void;
  globalDefaultUnlock: number;
  submitting: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onOpenVisibility: (note: VaultNote) => void;
  overrideByUser: Map<
    string,
    { allowed: VisibilityEntry[]; denied: VisibilityEntry[] }
  >;
  onLoadPreview: () => void;
  previewLoading: boolean;
}) {
  const {
    stats,
    notes,
    loading,
    error,
    filterMood,
    setFilterMood,
    showAdd,
    setShowAdd,
    newNote,
    setNewNote,
    selectedMood,
    setSelectedMood,
    unlockInput,
    setUnlockInput,
    globalDefaultUnlock,
    submitting,
    onAdd,
    onDelete,
    onOpenVisibility,
  } = props;

  return (
    <>
      {/* Stats */}
      <div className="flex gap-3 border-b border-[#16162a] px-6 py-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-1 items-center gap-3 rounded-2xl border border-[#1e1e30] bg-[#111317] p-3"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/5">
              <Icon name={stat.icon} size={18} className="text-[#ff2e93]" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-[10px] text-[#626775]">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mood Filter + Add */}
      <div className="flex items-center gap-2 border-b border-[#16162a] px-6 py-3">
        {[
          { key: "all", label: "Tất cả" },
          { key: "happy", label: "Vui" },
          { key: "sad", label: "Buồn" },
          { key: "angry", label: "Tức" },
          { key: "neutral", label: "Bình thường" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterMood(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterMood === f.key
                ? "bg-[#ff2e93]/10 text-[#ff2e93]"
                : "bg-white/5 text-[#94a3b8] hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#ff2e93]/10 px-4 py-2 text-xs font-semibold text-[#ff2e93] hover:bg-[#ff2e93]/20"
          >
            <Icon name="plus" size={14} />
            Thêm ghi chú
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add Note Form */}
      {showAdd && (
        <div className="border-b border-[#16162a] p-6">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Viết suy nghĩ của bạn..."
            rows={3}
            className="w-full resize-none rounded-2xl border border-[#232338] bg-[#111317] p-4 text-sm text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]/50"
            disabled={submitting}
          />

          {/* Mood picker */}
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_MOODS.map((mood) => (
              <button
                key={mood}
                onClick={() => setSelectedMood(mood)}
                disabled={submitting}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${moodConfig[mood].bg} ${moodConfig[mood].text} ${selectedMood === mood ? `${moodConfig[mood].border} border` : ""}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon name={moodConfig[mood].icon} size={14} className={moodConfig[mood].text} />
                  {moodConfig[mood].label}
                </span>
              </button>
            ))}
          </div>

          {/* Unlock threshold */}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#232338] bg-[#111317] p-3">
            <Icon name="users2" size={14} className="text-violet-300" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-white">
                Điểm thân thiết yêu cầu
              </p>
              <p className="text-[10px] text-[#626775]">
                Bạn bè cần đạt ngưỡng này mới thấy ghi chú. Bỏ trống = dùng mặc định {globalDefaultUnlock}đ.
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={1000}
              value={unlockInput}
              onChange={(e) => setUnlockInput(e.target.value)}
              placeholder={`${globalDefaultUnlock}`}
              disabled={submitting}
              className="w-20 rounded-lg border border-[#232338] bg-[#0c0c14] px-2 py-1 text-right text-sm text-white outline-none focus:border-violet-500/50"
            />
            <span className="text-xs text-[#626775]">điểm</span>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAdd(false);
                setNewNote("");
                setSelectedMood("neutral");
                setUnlockInput("");
              }}
              disabled={submitting}
              className="rounded-xl border border-[#232338] px-4 py-2 text-xs font-medium text-[#94a3b8]"
            >
              Hủy
            </button>
            <button
              onClick={onAdd}
              disabled={!newNote.trim() || submitting}
              className="rounded-xl bg-[#ff2e93] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff2e93]/80 disabled:opacity-60"
            >
              {submitting ? "Đang lưu..." : "Lưu bí mật"}
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-8 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const cfg = moodConfig[note.mood];
              const threshold =
                note.unlockPoints == null
                  ? globalDefaultUnlock
                  : note.unlockPoints;
              return (
                <div
                  key={note.id}
                  className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-sm font-medium ${cfg.text}`}>
                        <Icon name={cfg.icon} size={14} />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-[#626775]">
                        {new Date(note.createdAt * 1000).toLocaleDateString("vi-VN")}
                      </span>
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          note.visibility === "private"
                            ? "bg-white/5 text-[#94a3b8]"
                            : "bg-violet-500/10 text-violet-300"
                        }`}
                        title={
                          note.visibility === "private"
                            ? "Chỉ mình bạn thấy"
                            : `Bạn bè cần ≥ ${threshold} điểm thân thiết`
                        }
                      >
                        <Icon
                          name={note.visibility === "private" ? "lockSmall" : "users2"}
                          size={10}
                        />
                        {note.visibility === "private"
                          ? "Riêng tư"
                          : `≥${threshold}đ`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenVisibility(note)}
                        className="text-[#626775] hover:text-violet-300"
                        title="Chỉnh sửa quyền xem"
                      >
                        <Icon name="users2" size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(note.id)}
                        className="text-[#626775] hover:text-red-400"
                        title="Xóa"
                      >
                        <Icon name="circleX" size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-white/90">
                    {note.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {!loading && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/5">
              <Icon name="lockSmall" size={28} className="text-[#626775]" />
            </div>
            <p className="font-semibold text-[#94a3b8]">Chưa có ghi chú nào</p>
            <p className="mt-1 text-xs text-[#626775]">
              Bắt đầu lưu lại những suy nghĩ của bạn
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Shared feed view ──────────────────────────────────────────────────────

function SharedView({
  items,
  loading,
  globalDefaultUnlock,
  onOpen,
}: {
  items: SharedVaultItem[];
  loading: boolean;
  globalDefaultUnlock: number;
  onOpen: (it: SharedVaultItem) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="size-8 animate-spin rounded-full border-2 border-[#232338] border-t-violet-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/5">
            <Icon name="users2" size={28} className="text-[#626775]" />
          </div>
          <p className="font-semibold text-[#94a3b8]">
            Chưa có ghi chú chia sẻ nào
          </p>
          <p className="mt-1 max-w-md text-xs text-[#626775]">
            Khi bạn bè đủ {globalDefaultUnlock} điểm thân thiết với bạn, họ sẽ
            thấy ghi chú của bạn ở đây — và ngược lại, ghi chú của họ cũng sẽ
            hiện ở đây khi bạn đủ điểm.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <SharedVaultCard
              key={it.id}
              item={it}
              onOpen={() => onOpen(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One card in the shared feed. Two visual states:
 *   - locked:    blur the content, show a lock + "Cần X điểm để mở" hint
 *                on hover; clicking does nothing (still cursor-default).
 *   - unlocked:  render content normally; the whole card is a button
 *                that opens the detail modal.
 *
 * All numeric values come straight from the API row — no mockup data
 * anywhere in this component.
 */
function SharedVaultCard({
  item,
  onOpen,
}: {
  item: SharedVaultItem;
  onOpen: () => void;
}) {
  const cfg = moodConfig[item.mood];
  const authorName = item.author.name ?? `@${item.author.username}`;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[#1e1e30] bg-[#111317] p-4 transition-colors ${
        item.locked
          ? "hover:border-amber-500/30"
          : "cursor-pointer hover:border-violet-500/40"
      }`}
      onClick={item.locked ? undefined : onOpen}
      onKeyDown={(e) => {
        if (item.locked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role={item.locked ? undefined : "button"}
      tabIndex={item.locked ? -1 : 0}
      aria-label={
        item.locked
          ? `Ghi chú bị khóa từ @${item.author.username}`
          : `Mở ghi chú từ @${item.author.username}`
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <SafeAvatar
          src={item.author.avatar}
          name={authorName}
          className="size-10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {authorName}
          </p>
          <p className="text-[10px] text-[#626775]">
            @{item.author.username} ·{" "}
            {new Date(item.createdAt * 1000).toLocaleDateString("vi-VN")}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1">
          <Icon name="users2" size={10} className="text-violet-300" />
          <span className="text-[10px] font-semibold text-violet-300">
            {item.closenessPoints}/{item.effectiveUnlock}đ
          </span>
        </div>
      </div>

      <div className={`mb-2 flex items-center gap-2`}>
        <span className={`flex items-center gap-1 text-xs font-medium ${cfg.text}`}>
          <Icon name={cfg.icon} size={12} />
          {cfg.label}
        </span>
        {item.moodFiltered && (
          <span
            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-300"
            title="Bạn được phép xem note này nhờ cài đặt riêng của tác giả"
          >
            Cho phép đặc biệt
          </span>
        )}
      </div>

      {item.locked ? (
        <LockedNoteContent item={item} />
      ) : (
        <p className="text-sm leading-relaxed text-white/90">{item.content}</p>
      )}
    </div>
  );
}

/**
 * Renders the body of a locked card. The text is the real content
 * (still helpful context for the viewer) but it's blurred so a glance
 * doesn't reveal the substance. The lock + "Cần X điểm để mở" tooltip
 * appears on hover so the viewer knows exactly what they need.
 */
function LockedNoteContent({ item }: { item: SharedVaultItem }) {
  return (
    <div className="relative">
      <p
        aria-hidden="true"
        className="select-none text-sm leading-relaxed text-white/90"
        style={{
          filter: "blur(6px)",
          WebkitMaskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 100%)",
        }}
      >
        {item.content}
      </p>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
        title={`Cần ${item.pointsToUnlock} điểm thân thiết nữa để mở khoá`}
      >
        <div className="rounded-full border border-amber-500/40 bg-[#0c0c14]/85 px-3 py-1.5 text-[11px] font-semibold text-amber-300 shadow-lg shadow-black/30 backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <Icon name="lockSmall" size={11} className="text-amber-300" />
            Cần {item.pointsToUnlock} điểm để mở
          </span>
        </div>
        <span className="rounded-full bg-[#0c0c14]/80 px-2 py-0.5 text-[9px] text-[#c8cdd9] backdrop-blur-sm">
          {item.closenessPoints}/{item.effectiveUnlock}đ
        </span>
      </div>
    </div>
  );
}

// ─── Visibility editor modal ─────────────────────────────────────────────────

function VisibilityEditor(props: {
  note: VaultNote;
  friends: FriendRow[];
  entries: VisibilityEntry[];
  overrideByUser: Map<
    string,
    { allowed: VisibilityEntry[]; denied: VisibilityEntry[] }
  >;
  unlockInput: string;
  setUnlockInput: (s: string) => void;
  visibility: "private" | "shared";
  setVisibility: (v: "private" | "shared") => void;
  saving: boolean;
  error: string | null;
  search: string;
  setSearch: (s: string) => void;
  pickerTab: "allowed" | "denied";
  setPickerTab: (t: "allowed" | "denied") => void;
  preview: VisibilityPreviewResponse | null;
  previewLoading: boolean;
  onAddBlanket: (userId: string, state: "allowed" | "denied") => void;
  onClearAll: (userId: string) => void;
  onToggleMood: (
    userId: string,
    state: "allowed" | "denied",
    mood: Mood,
  ) => void;
  onClose: () => void;
  onSave: () => void;
  onLoadPreview: () => void;
  globalDefaultUnlock: number;
}) {
  const {
    note,
    friends,
    overrideByUser,
    unlockInput,
    setUnlockInput,
    visibility,
    setVisibility,
    saving,
    error,
    search,
    setSearch,
    pickerTab,
    setPickerTab,
    preview,
    previewLoading,
    onAddBlanket,
    onClearAll,
    onToggleMood,
    onClose,
    onSave,
    onLoadPreview,
    globalDefaultUnlock,
  } = props;

  // Friends already added to the current tab.
  const inCurrentTab = useCallback(
    (userId: string) => {
      const slot = overrideByUser.get(userId);
      if (!slot) return false;
      return pickerTab === "allowed"
        ? slot.allowed.length > 0
        : slot.denied.length > 0;
    },
    [overrideByUser, pickerTab],
  );

  // Filter friends by name / username / bio AND by current tab state
  // (default: hide friends already added to this tab, but allow search
  // to override the filter via the "Tất cả" chip below).
  const [includeAlreadyAdded, setIncludeAlreadyAdded] = useState(false);

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    return friends.filter((f) => {
      if (!includeAlreadyAdded && inCurrentTab(f.user.id)) return false;
      if (!q) return true;
      const haystack = [
        f.user.username,
        f.user.name ?? "",
        f.user.bio ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [friends, search, includeAlreadyAdded, inCurrentTab]);

  const allowedCount = Array.from(overrideByUser.values()).reduce(
    (s, v) => s + v.allowed.length,
    0,
  );
  const deniedCount = Array.from(overrideByUser.values()).reduce(
    (s, v) => s + v.denied.length,
    0,
  );

  const thresholdText =
    unlockInput.trim() === ""
      ? `mặc định ${globalDefaultUnlock}đ`
      : `${unlockInput.trim()}đ`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#0c0c14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#232338] px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Cài đặt quyền xem chi tiết
            </h3>
            <p className="mt-1 text-xs text-[#626775]">
              Tùy chỉnh ai được thấy, ai bị ẩn, áp dụng cho cả note hoặc từng mood
            </p>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-[#626775]">
              <span className="flex items-center gap-1">
                <Icon name="eye" size={11} className="text-emerald-300" />
                Đang cho phép: {allowedCount}
              </span>
              <span className="flex items-center gap-1">
                <Icon name="eyeOff" size={11} className="text-red-300" />
                Đang ẩn: {deniedCount}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#626775] hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        {/* Settings: visibility mode + threshold */}
        <div className="border-b border-[#232338] p-5">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-white">
                Chế độ hiển thị
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setVisibility("shared")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    visibility === "shared"
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                      : "border-[#232338] bg-[#111317] text-[#94a3b8]"
                  }`}
                >
                  Chia sẻ (bạn bè đủ điểm)
                </button>
                <button
                  onClick={() => setVisibility("private")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    visibility === "private"
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border-[#232338] bg-[#111317] text-[#94a3b8]"
                  }`}
                >
                  Riêng tư (chỉ mình)
                </button>
              </div>
            </div>

            {visibility === "shared" && (
              <div className="flex items-center gap-3 rounded-xl border border-[#232338] bg-[#111317] p-3">
                <Icon name="users2" size={14} className="text-violet-300" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">
                    Điểm thân thiết yêu cầu
                  </p>
                  <p className="text-[10px] text-[#626775]">
                    Người xem cần ≥ {thresholdText} thân thiết với bạn
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={unlockInput}
                  onChange={(e) => setUnlockInput(e.target.value)}
                  placeholder={`${globalDefaultUnlock}`}
                  className="w-20 rounded-lg border border-[#232338] bg-[#0c0c14] px-2 py-1 text-right text-sm text-white outline-none focus:border-violet-500/50"
                />
                <span className="text-xs text-[#626775]">điểm</span>
              </div>
            )}
          </div>
        </div>

        {/* Sub-tabs: Ai được thấy / Ai bị ẩn / Preview */}
        <div className="flex items-center gap-1 px-3 pt-3">
          <button
            onClick={() => setPickerTab("allowed")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              pickerTab === "allowed"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-white/5 text-[#94a3b8] hover:bg-white/10"
            }`}
          >
            <Icon name="eye" size={12} />
            Được thấy ({allowedCount})
          </button>
          <button
            onClick={() => setPickerTab("denied")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              pickerTab === "denied"
                ? "bg-red-500/15 text-red-300"
                : "bg-white/5 text-[#94a3b8] hover:bg-white/10"
            }`}
          >
            <Icon name="eyeOff" size={12} />
            Bị ẩn ({deniedCount})
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onLoadPreview}
              disabled={previewLoading}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#94a3b8] hover:bg-white/10 disabled:opacity-50"
              title="Xem trước ai sẽ thấy ghi chú này"
            >
              <Icon name="layoutGrid" size={12} />
              {previewLoading ? "Đang tải…" : "Preview"}
            </button>
          </div>
        </div>

        {/* Preview panel (only when loaded) */}
        {preview && (
          <PreviewPanel preview={preview} />
        )}

        {/* Search + include already added toggle */}
        <div className="flex items-center gap-2 border-b border-[#232338] px-4 py-3">
          <div className="relative flex-1">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#626775]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                pickerTab === "allowed"
                  ? "Tìm bạn để cho phép xem…"
                  : "Tìm bạn để ẩn…"
              }
              className="w-full rounded-[14px] border border-[#232338] bg-[#111317] py-2 pl-9 pr-3 text-[13px] text-white placeholder:text-[#626775] focus:border-violet-500/50 focus:outline-none"
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-[#94a3b8]">
            <input
              type="checkbox"
              checked={includeAlreadyAdded}
              onChange={(e) => setIncludeAlreadyAdded(e.target.checked)}
              className="size-3.5 accent-violet-500"
            />
            Hiện cả đã thêm
          </label>
        </div>

        {/* Friend picker */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filteredFriends.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#626775]">
              {search.trim()
                ? "Không tìm thấy bạn bè phù hợp."
                : pickerTab === "allowed"
                  ? "Bạn đã cho phép tất cả bạn bè. Thêm người mới bằng ô tìm kiếm."
                  : "Bạn chưa ẩn ai. Thêm bằng ô tìm kiếm."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredFriends.map((f) => (
                <FriendRowItem
                  key={f.user.id}
                  friend={f}
                  tab={pickerTab}
                  currentEntry={
                    overrideByUser.get(f.user.id)?.[pickerTab]?.[0] ?? null
                  }
                  onAddBlanket={() => onAddBlanket(f.user.id, pickerTab)}
                  onClearAll={() => onClearAll(f.user.id)}
                  onToggleMood={(m) => onToggleMood(f.user.id, pickerTab, m)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="mx-5 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-[#232338] px-5 py-3">
          <p className="text-[10px] text-[#626775]">
            Không chọn = dùng ngưỡng điểm ({thresholdText})
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-[#232338] px-4 py-2 text-xs font-semibold text-[#94a3b8]"
              disabled={saving}
            >
              Hủy
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500/80 disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Lưu cài đặt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Single friend row inside the picker ───────────────────────────────────

function FriendRowItem(props: {
  friend: FriendRow;
  tab: "allowed" | "denied";
  currentEntry: VisibilityEntry | null;
  onAddBlanket: () => void;
  onClearAll: () => void;
  onToggleMood: (m: Mood) => void;
}) {
  const { friend, tab, currentEntry, onAddBlanket, onClearAll, onToggleMood } =
    props;
  const hasEntry = currentEntry !== null;
  const isBlanket = hasEntry && currentEntry!.moodFilter.length === 0;
  const filteredMoods = hasEntry ? currentEntry!.moodFilter : [];

  const accentBg =
    tab === "allowed" ? "border-emerald-500/30" : "border-red-500/30";
  const accentText =
    tab === "allowed" ? "text-emerald-300" : "text-red-300";

  return (
    <li
      className={`rounded-xl border bg-[#111317] p-3 ${accentBg}`}
    >
      <div className="flex items-center gap-3">
        <SafeAvatar
          src={friend.user.avatar}
          name={friend.user.name ?? friend.user.username}
          className="size-10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-white">
            {friend.user.name ?? `@${friend.user.username}`}
          </p>
          <p className="text-[10px] text-[#626775]">
            @{friend.user.username} · {friend.points}đ thân thiết
          </p>
        </div>
        {hasEntry ? (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[10px] font-semibold text-[#94a3b8] hover:bg-white/10"
            title="Bỏ override này — quay về mặc định theo điểm"
          >
            <Icon name="circleX" size={11} />
            Bỏ chọn
          </button>
        ) : (
          <button
            onClick={onAddBlanket}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${accentText} bg-white/5 hover:bg-white/10`}
            title={
              tab === "allowed"
                ? "Cho phép xem tất cả mood"
                : "Ẩn tất cả mood"
            }
          >
            <Icon name={tab === "allowed" ? "eye" : "eyeOff"} size={11} />
            {tab === "allowed" ? "Cho phép" : "Ẩn"}
          </button>
        )}
      </div>

      {/* Mood filter row — visible after entry exists. Lets the owner
          constrain the override to specific note moods. */}
      {hasEntry && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#232338] pt-2">
          <span className="text-[10px] text-[#626775]">
            {isBlanket
              ? `Áp dụng cho mọi mood. Nhấn để giới hạn:`
              : `Chỉ áp dụng cho:`}
          </span>
          {ALL_MOODS.map((m) => {
            const active = filteredMoods.includes(m);
            return (
              <button
                key={m}
                onClick={() => onToggleMood(m)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  active
                    ? `${moodConfig[m].border} ${moodConfig[m].bg} ${moodConfig[m].text}`
                    : "border-[#232338] text-[#626775] hover:text-white"
                }`}
              >
                <Icon name={moodConfig[m].icon} size={10} />
                {moodConfig[m].short}
              </button>
            );
          })}
          {!isBlanket && (
            <button
              onClick={() => {
                // Click each mood to deselect, but quicker: clear all
                // moods → "all moods" blanket state again.
                for (const m of filteredMoods) onToggleMood(m);
              }}
              className="ml-auto text-[10px] text-[#94a3b8] underline-offset-2 hover:underline"
            >
              Reset mọi mood
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Preview panel ─────────────────────────────────────────────────────────

function PreviewPanel({ preview }: { preview: VisibilityPreviewResponse }) {
  const [expanded, setExpanded] = useState<{
    key: "allowedByPoints" | "explicitAllowed" | "explicitDenied" | "hiddenByPoints";
    label: string;
  } | null>(null);

  const sections = [
    {
      key: "allowedByPoints" as const,
      label: "Đủ điểm · sẽ thấy",
      icon: "users2" as const,
      accent: "text-emerald-300",
      bg: "bg-emerald-500/10",
      items: preview.buckets.allowedByPoints,
    },
    {
      key: "explicitAllowed" as const,
      label: "Được phép đặc biệt · sẽ thấy dù điểm thấp",
      icon: "eye" as const,
      accent: "text-violet-300",
      bg: "bg-violet-500/10",
      items: preview.buckets.explicitAllowed,
    },
    {
      key: "explicitDenied" as const,
      label: "Bị ẩn đặc biệt · sẽ không thấy dù đủ điểm",
      icon: "eyeOff" as const,
      accent: "text-red-300",
      bg: "bg-red-500/10",
      items: preview.buckets.explicitDenied,
    },
    {
      key: "hiddenByPoints" as const,
      label: "Chưa đủ điểm · sẽ không thấy",
      icon: "lockSmall" as const,
      accent: "text-[#94a3b8]",
      bg: "bg-white/5",
      items: preview.buckets.hiddenByPoints,
    },
  ];

  return (
    <div className="border-b border-[#232338] bg-[#0c0c14] px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="layoutGrid" size={14} className="text-violet-300" />
          <p className="text-xs font-semibold text-white">
            Preview: ai sẽ thấy note "{moodConfig[preview.noteMood].short}"
          </p>
        </div>
        <span className="text-[10px] text-[#626775]">
          {preview.totals.willSee}/{preview.totals.friends} bạn bè thấy · ngưỡng {preview.effectiveUnlock}đ
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() =>
              setExpanded(
                expanded?.key === s.key
                  ? null
                  : { key: s.key, label: s.label },
              )
            }
            className={`flex items-center justify-between rounded-lg border border-[#232338] ${s.bg} px-3 py-2 text-left transition-colors hover:border-violet-500/40`}
          >
            <div className="flex items-center gap-2">
              <Icon name={s.icon} size={12} className={s.accent} />
              <span className={`text-[11px] font-semibold ${s.accent}`}>
                {s.label}
              </span>
            </div>
            <span className={`text-sm font-bold ${s.accent}`}>
              {s.items.length}
            </span>
          </button>
        ))}
      </div>
      {expanded && (
        <div className="mt-3 rounded-lg border border-[#232338] bg-[#0c0c14] p-3">
          <p className="mb-2 text-[10px] font-semibold text-[#94a3b8]">
            {expanded.label}
          </p>
          {preview.buckets[expanded.key].length === 0 ? (
            <p className="text-[10px] text-[#626775]">(Trống)</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {preview.buckets[expanded.key].map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-2 rounded-lg border border-[#232338] bg-[#111317] p-2"
                >
                  <SafeAvatar
                    src={u.avatar}
                    name={u.name ?? u.username}
                    className="size-7"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-white">
                      {u.name ?? `@${u.username}`}
                    </p>
                    <p className="text-[9px] text-[#626775]">
                      @{u.username} · {u.closenessPoints}đ
                      {u.moodFiltered ? " · mood-filtered" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}