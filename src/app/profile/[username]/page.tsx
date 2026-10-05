"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/ui/Icon";
import { proxyAvatar } from "@/lib/avatar";
import { UPLOAD_PRESET, CLOUDINARY_UPLOAD_URL } from "@/lib/cloudinary";
import { PostDetailModal } from "@/components/PostDetailModal";
import { useCloseness, MIRROR_CONFIG } from "@/lib/closeness";

// ───────────────────────── types ─────────────────────────
interface ProfileData {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  coverPhoto: string | null;
  birthday: number | null;
  location: string | null;
  website: string | null;
  phone: string | null;
  gender: string | null;
  occupation: string | null;
  education: string | null;
  hobbies: string | null;
  relationshipStatus: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: number;
  stats: {
    postCount: number;
    friendCount: number;
    followersCount: number;
    followingCount: number;
  };
  relationship: {
    isMe: boolean;
    isFriend: boolean;
    isFollowing: boolean;
    isFollower: boolean;
    requestSent: boolean;
    requestReceived: boolean;
  };
  presence: {
    code: number;
    label: string;
    dotColor: "green" | "muted" | "gray";
    isOnline: boolean;
  };
}

interface PostItem {
  id: string;
  userId: string;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  lens: string;
  createdAt: number;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}

interface UserSummary {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  presence: ProfileData["presence"];
}

// ───────────────────────── helpers ───────────────────────
function avatarColor(seed: string): string {
  // Deterministic gradient pair based on username
  const hueA = (seed.charCodeAt(0) * 37) % 360;
  const hueB = (hueA + 60) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 70% 55%), hsl(${hueB} 70% 60%))`;
}

function formatBirthday(unixSec: number | null): string | null {
  if (!unixSec || unixSec <= 0) return null;
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" });
}

function formatAge(unixSec: number | null): number | null {
  if (!unixSec || unixSec <= 0) return null;
  const ms = Date.now() - unixSec * 1000;
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
}

function formatJoinDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
}

function formatShortDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const GENDER_LABELS: Record<string, string> = {
  male: "Nam",
  female: "Nữ",
  other: "Khác",
  prefer_not_to_say: "Không muốn tiết lộ",
};

const REL_LABELS: Record<string, string> = {
  single: "Độc thân",
  in_relationship: "Đang hẹn hò",
  married: "Đã kết hôn",
  complicated: "Phức tạp",
};

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─────────────────── Edit Profile Modal ───────────────────
function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: ProfileData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState(profile.avatar ?? "");
  const [coverPhoto, setCoverPhoto] = useState(profile.coverPhoto ?? "");
  const [birthday, setBirthday] = useState(
    profile.birthday ? new Date(profile.birthday * 1000).toISOString().slice(0, 10) : ""
  );
  const [location, setLocation] = useState(profile.location ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [occupation, setOccupation] = useState(profile.occupation ?? "");
  const [education, setEducation] = useState(profile.education ?? "");
  const [hobbies, setHobbies] = useState(profile.hobbies ?? "");
  const [relationshipStatus, setRelationshipStatus] = useState(
    profile.relationshipStatus ?? ""
  );
  // ── Discover-location fields ──
  // city/country are free-text (used by Discover → "Gần bên" tab).
  // latitude/longitude are optional decimal coords for real distance.
  // We sync them from the profile record but only PATCH them when the
  // user actually touches the inputs (see `locationDirty` below).
  const [city, setCity] = useState(profile.city ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  const [latitude, setLatitude] = useState<string>(
    profile.latitude !== null && profile.latitude !== undefined
      ? String(profile.latitude)
      : ""
  );
  const [longitude, setLongitude] = useState<string>(
    profile.longitude !== null && profile.longitude !== undefined
      ? String(profile.longitude)
      : ""
  );
  const [locationDirty, setLocationDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  async function uploadFile(
    file: File,
    kind: "avatar" | "cover",
    setter: (v: string) => void
  ) {
    const setBusy = kind === "avatar" ? setUploadingAvatar : setUploadingCover;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("folder", `profile/${kind}`);
      const res = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        // Surface the Cloudinary error message so we can see exactly why
        // a 401 was returned (most commonly: wrong cloud_name or upload preset).
        const errPayload = await res.json().catch(() => null) as
          | { error?: { message?: string } }
          | null;
        const msg = errPayload?.error?.message;
        throw new Error(
          msg
            ? `Upload thất bại: ${msg}`
            : `Upload thất bại (HTTP ${res.status})`
        );
      }
      const data = await res.json();
      setter(data.secure_url);
    } catch (e: any) {
      setError(e?.message || "Upload thất bại");
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "cover") {
    const file = e.target.files?.[0];
    if (!file) return;
    if (kind === "avatar") {
      uploadFile(file, "avatar", setAvatar);
    } else {
      uploadFile(file, "cover", setCoverPhoto);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim() || null,
        bio: bio.trim() || null,
        avatar: avatar.trim() || null,
        coverPhoto: coverPhoto.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        phone: phone.trim() || null,
        gender: gender || null,
        occupation: occupation.trim() || null,
        education: education.trim() || null,
        hobbies: hobbies.trim() || null,
        relationshipStatus: relationshipStatus || null,
      };
      if (birthday) {
        body.birthday = Math.floor(new Date(birthday).getTime() / 1000);
      } else {
        body.birthday = null;
      }

      // Only PATCH the Discover-location block when the user has
      // actually edited one of the inputs. Otherwise we'd be sending
      // back whatever the server already returned, which is a no-op
      // for free-text but still adds 4 SQL columns to the UPDATE.
      if (locationDirty) {
        body.city = city.trim() || null;
        body.country = country.trim() || null;
        // Parse to number or send null when the field is blank.
        // Using parseFloat is safe because the server validates the
        // range (-90..90 / -180..180) and the value will be coerced
        // back to a real on the SQLite side.
        body.latitude = latitude.trim() === "" ? null : Number(latitude);
        body.longitude = longitude.trim() === "" ? null : Number(longitude);
      }

      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PATCH",
        // Same-origin default: cookies are sent automatically. We still pass
        // credentials: 'include' defensively to cover any future cross-origin
        // hosting (e.g. when the profile page is served from a different
        // subdomain than the API).
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Lỗi ${res.status}`;
        if (res.status === 401) {
          throw new Error(
            "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại."
          );
        }
        throw new Error(msg);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#171920] p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Chỉnh sửa hồ sơ</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Cover + avatar uploads */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-[#a0a5b5]">
            Ảnh bìa
          </label>
          <div className="relative h-32 overflow-hidden rounded-xl border border-white/10">
            {coverPhoto ? (
              <img
                src={coverPhoto}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-gradient-to-br from-[#ff2e93] to-[#ff8a56]" />
            )}
            <label className="absolute right-2 top-2 cursor-pointer rounded-full bg-black/60 p-2 transition-colors hover:bg-black/80">
              <Icon name="camera" size={16} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFileChange(e, "cover")}
                disabled={uploadingCover}
              />
            </label>
            {uploadingCover && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
                Đang tải...
              </div>
            )}
          </div>

          <label className="mb-2 mt-4 block text-sm font-medium text-[#a0a5b5]">
            Ảnh đại diện
          </label>
          <div className="flex items-center gap-4">
            <div className="relative size-20 overflow-hidden rounded-full">
              {avatar ? (
                <img src={proxyAvatar(avatar) ?? ""} alt="" className="size-full object-cover" />
              ) : (
                <div
                  className="flex size-full items-center justify-center text-2xl font-bold text-white"
                  style={{ background: avatarColor(profile.username) }}
                >
                  {(profile.name ?? profile.username)[0].toUpperCase()}
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs">
                  ...
                </div>
              )}
            </div>
            <label className="cursor-pointer rounded-full border border-white/20 px-4 py-2 text-sm transition-colors hover:bg-white/10">
              {uploadingAvatar ? "Đang tải..." : "Đổi ảnh"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFileChange(e, "avatar")}
                disabled={uploadingAvatar}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tên hiển thị">
            <input
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              type="tel"
              value={phone}
              maxLength={30}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Ngày sinh">
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Giới tính">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            >
              <option value="">Chưa thiết lập</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
              <option value="prefer_not_to_say">Không muốn tiết lộ</option>
            </select>
          </Field>
          <Field label="Địa điểm">
            <input
              type="text"
              value={location}
              maxLength={120}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ví dụ: Hà Nội, Việt Nam"
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>

          {/* ── Discover location (city/country + lat/lng) ── */}
          {/* These power the "Gần bên" filter on the Discover page.
            Users can leave them blank and the API will simply fall
            back to the country-level match. */}
          <Field label="Thành phố (cho tab Khám phá)">
            <input
              type="text"
              value={city}
              maxLength={80}
              onChange={(e) => {
                setCity(e.target.value);
                setLocationDirty(true);
              }}
              placeholder="Ví dụ: Hà Nội"
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Quốc gia">
            <input
              type="text"
              value={country}
              maxLength={80}
              onChange={(e) => {
                setCountry(e.target.value);
                setLocationDirty(true);
              }}
              placeholder="Ví dụ: Việt Nam"
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vĩ độ (latitude)">
              <input
                type="number"
                step="0.000001"
                min={-90}
                max={90}
                value={latitude}
                onChange={(e) => {
                  setLatitude(e.target.value);
                  setLocationDirty(true);
                }}
                placeholder="21.0285"
                className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
              />
            </Field>
            <Field label="Kinh độ (longitude)">
              <input
                type="number"
                step="0.000001"
                min={-180}
                max={180}
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  setLocationDirty(true);
                }}
                placeholder="105.8542"
                className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
              />
            </Field>
          </div>
          <p className="-mt-3 text-[11px] text-[#626775]">
            Tọa độ dùng để tính khoảng cách thực với người dùng khác. Để trống nếu không muốn chia sẻ.
          </p>
          <Field label="Website">
            <input
              type="url"
              value={website}
              maxLength={200}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Công việc">
            <input
              type="text"
              value={occupation}
              maxLength={120}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Kỹ sư phần mềm tại..."
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Học vấn">
            <input
              type="text"
              value={education}
              maxLength={120}
              onChange={(e) => setEducation(e.target.value)}
              placeholder="Đại học Bách Khoa Hà Nội"
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
          <Field label="Trạng thái quan hệ">
            <select
              value={relationshipStatus}
              onChange={(e) => setRelationshipStatus(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            >
              <option value="">Chưa thiết lập</option>
              <option value="single">Độc thân</option>
              <option value="in_relationship">Đang hẹn hò</option>
              <option value="married">Đã kết hôn</option>
              <option value="complicated">Phức tạp</option>
            </select>
          </Field>
          <Field label="Sở thích">
            <input
              type="text"
              value={hobbies}
              maxLength={240}
              onChange={(e) => setHobbies(e.target.value)}
              placeholder="Đọc sách, du lịch, nấu ăn..."
              className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
            />
          </Field>
        </div>

        <Field label="Tiểu sử" className="mt-4">
          <textarea
            value={bio}
            maxLength={500}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Viết vài dòng về bạn..."
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-[#111317] px-3 py-2 text-sm outline-none focus:border-[#ff2e93]"
          />
          <p className="mt-1 text-right text-[11px] text-[#626775]">
            {bio.length}/500
          </p>
        </Field>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-5 py-2 text-sm transition-colors hover:bg-white/5"
            disabled={saving}
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(40deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
            }}
          >
            {saving ? "Đang lưu..." : "Lưu thay đ�i"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[12px] font-medium text-[#a0a5b5]">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─────────────────── Friend list modal ────────────────────
function ListModal({
  title,
  users,
  onClose,
}: {
  title: string;
  users: UserSummary[];
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#171920] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={20} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {users.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#626775]">
              Danh sách trống
            </p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/profile/${u.username}`);
                }}
                className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-white/5"
              >
                <div className="relative shrink-0">
                  <div className="size-11 overflow-hidden rounded-full">
                    {u.avatar ? (
                      <img src={proxyAvatar(u.avatar) ?? ""} alt="" className="size-full object-cover" />
                    ) : (
                      <div
                        className="flex size-full items-center justify-center text-sm font-bold text-white"
                        style={{ background: avatarColor(u.username) }}
                      >
                        {(u.name ?? u.username)[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  {u.presence?.dotColor === "green" && (
                    <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#171920] bg-emerald-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {u.name ?? u.username}
                  </p>
                  <p className="truncate text-[12px] text-[#626775]">
                    @{u.username}
                  </p>
                </div>
                <span className="text-[10px] text-[#626775]">{u.presence?.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Main Page ───────────────────────────
export default function ProfilePage({ params }: { params: { username: string } }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [openList, setOpenList] = useState<null | "friends" | "followers" | "following">(null);
  const [listUsers, setListUsers] = useState<UserSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  // Resolve route param. In Next 14 `params` is a plain object (Next
  // 15 made it a Promise); read it directly.
  useEffect(() => {
    setUsername(params.username);
  }, [params.username]);

  // Load profile + posts
  async function loadProfile() {
    if (!username) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await safeJson<ProfileData | { error: string }>(res);
      if (!res.ok || !data || "error" in data) {
        if (res.status === 401) {
          throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.");
        }
        throw new Error((data && "error" in data && data.error) || `Lỗi ${res.status}`);
      }
      setProfile(data as ProfileData);

      const postsRes = await fetch(
        `/api/users/${encodeURIComponent(username)}/posts`,
        { cache: "no-store", credentials: "include" }
      );
      const postsData = await safeJson<PostItem[]>(postsRes);
      setPosts(Array.isArray(postsData) ? postsData : []);
    } catch (e: any) {
      setError(e?.message || "Không tải được hồ sơ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // Auto-refresh profile every 30s (so stats / presence stay fresh)
  useEffect(() => {
    if (!username) return;
    const interval = setInterval(loadProfile, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  async function handleFollow() {
    if (!profile || profile.relationship.isMe) return;
    setFollowBusy(true);
    try {
      // Optimistic: assume "accepted" (mutual). If only one-way, the API
      // still returns "accepted" for our outgoing row — the badge text we
      // show is just "Đã theo dõi" rather than "Bạn bè".
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              relationship: {
                ...prev.relationship,
                isFollowing: true,
                requestSent: true,
              },
            }
          : prev
      );
      const res = await fetch(`/api/users/${profile.id}/follow`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Theo dõi thất bại");
      await loadProfile();
    } catch (e: any) {
      setError(e?.message || "Lỗi");
      // Revert on failure
      await loadProfile();
    } finally {
      setFollowBusy(false);
    }
  }

  async function handleUnfollow() {
    if (!profile || profile.relationship.isMe) return;
    setFollowBusy(true);
    try {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              relationship: {
                ...prev.relationship,
                isFriend: false,
                isFollowing: false,
                requestSent: false,
              },
            }
          : prev
      );
      const res = await fetch(`/api/users/${profile.id}/follow`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Bỏ theo dõi thất bại");
      await loadProfile();
    } catch (e: any) {
      setError(e?.message || "Lỗi");
      await loadProfile();
    } finally {
      setFollowBusy(false);
    }
  }

  async function openListModal(kind: "friends" | "followers" | "following") {
    if (!profile) return;
    setOpenList(kind);
    setListLoading(true);
    setListUsers([]);
    try {
      const res = await fetch(
        `/api/users/${profile.id}/friends?list=${kind}`,
        { cache: "no-store", credentials: "include" }
      );
      const data = await safeJson<UserSummary[]>(res);
      setListUsers(Array.isArray(data) ? data : []);
    } finally {
      setListLoading(false);
    }
  }

  async function startConversation() {
    if (!profile || profile.relationship.isMe) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: profile.id }),
      });
      const data = await safeJson<{ id?: string }>(res);
      if (data?.id) router.push(`/?conv=${data.id}`);
    } catch (e: any) {
      setError(e?.message || "Không thể bắt đầu cuộc trò chuyện");
    }
  }

  if (loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0e] text-white">
        <div className="flex items-center gap-3 text-[#a0a5b5]">
          <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#ff2e93]" />
          Đang tải hồ sơ...
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0e] text-white">
        <div className="text-center">
          <p className="mb-4 text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const displayName = profile.name || profile.username;
  const initial = displayName[0]?.toUpperCase() ?? "?";
  const age = formatAge(profile.birthday);
  const birthdayText = formatBirthday(profile.birthday);

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white">
      {/* Cover */}
      <div className="relative h-56 w-full overflow-hidden bg-[#171920] md:h-72">
        {profile.coverPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.coverPhoto}
            alt=""
            className="size-full object-cover"
            loading="eager"
            decoding="async"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-[#ff2e93] to-[#ff8a56]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0e] via-transparent to-transparent" />
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm backdrop-blur transition-colors hover:bg-black/60"
        >
          <Icon name="arrowLeft" size={14} />
          Quay lại
        </button>
      </div>

      {/* Header card */}
      <div className="mx-auto -mt-16 max-w-4xl px-4">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-white/10 bg-[rgba(31,33,40,0.63)] p-6 backdrop-blur md:flex-row md:items-end md:gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="size-32 overflow-hidden rounded-full border-4 border-[#0a0b0e] bg-[#171920] md:size-36">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyAvatar(profile.avatar) ?? ""} alt="" className="size-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div
                  className="flex size-full items-center justify-center text-4xl font-bold text-white md:text-5xl"
                  style={{ background: avatarColor(profile.username) }}
                >
                  {initial}
                </div>
              )}
            </div>
            {profile.presence?.dotColor === "green" && (
              <span className="absolute bottom-2 right-2 size-5 rounded-full border-4 border-[#0a0b0e] bg-emerald-400">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
              </span>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold md:text-3xl">{displayName}</h1>
              {!profile.relationship.isMe && profile.relationship.isFriend && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                  <Icon name="heartHandshake" size={11} />
                  Bạn bè
                </span>
              )}
              {!profile.relationship.isMe && (
                <ClosenessBadge
                  profileUserId={profile.id}
                  myId={
                    (session?.user as { id?: string } | undefined)?.id ?? null
                  }
                />
              )}
            </div>
            <p className="mt-0.5 text-sm text-[#a0a5b5]">@{profile.username}</p>
            <p className="mt-2 text-[13px] text-[#626775]">
              {profile.presence?.label ?? "Chưa rõ"} · Tham gia{" "}
              {formatJoinDate(profile.createdAt)}
            </p>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.relationship.isMe ? (
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition-colors hover:bg-white/10"
                >
                  <Icon name="edit" size={14} />
                  Chỉnh sửa hồ sơ
                </button>
              ) : (
                <>
                  {profile.relationship.isFriend || profile.relationship.isFollowing ? (
                    <button
                      type="button"
                      onClick={handleUnfollow}
                      disabled={followBusy}
                      className="flex items-center gap-1.5 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-60"
                    >
                      {profile.relationship.isFriend && <Icon name="heartHandshake" size={14} />}
                      {profile.relationship.isFriend ? "Bạn bè" : "Đang theo dõi"}
                    </button>
                  ) : profile.relationship.requestSent ? (
                    <button
                      type="button"
                      disabled
                      className="flex items-center gap-1.5 rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-[#a0a5b5]"
                    >
                      <Icon name="check" size={14} />
                      Đã gửi lời mời
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFollow}
                      disabled={followBusy}
                      className="flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                      style={{
                        backgroundImage:
                          "linear-gradient(40deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                      }}
                    >
                      <Icon name="userPlus" size={14} />
                      Theo dõi
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={startConversation}
                    className="flex items-center gap-1.5 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition-colors hover:bg-white/10"
                  >
                    <Icon name="messageCircle" size={14} />
                    Nhắn tin
                  </button>
                </>
              )}
              <button
                type="button"
                className="rounded-full border border-white/10 p-2 transition-colors hover:bg-white/10"
                aria-label="Chia sẻ"
              >
                <Icon name="share2" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatButton
            label="Bài viết"
            value={profile.stats.postCount}
            onClick={() => {
              const el = document.getElementById("posts-grid");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <StatButton
            label="Bạn bè"
            value={profile.stats.friendCount}
            onClick={() => openListModal("friends")}
          />
          <StatButton
            label="Follower"
            value={profile.stats.followersCount}
            onClick={() => openListModal("followers")}
          />
          <StatButton
            label="Đang follow"
            value={profile.stats.followingCount}
            onClick={() => openListModal("following")}
          />
        </div>

        {/* Two-column: info + posts */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: about */}
          <aside className="space-y-4 lg:col-span-1">
            <section className="rounded-2xl border border-white/10 bg-[rgba(31,33,40,0.63)] p-5 backdrop-blur">
              <h2 className="mb-3 text-base font-bold">Giới thiệu</h2>
              {profile.bio ? (
                <p className="mb-4 text-sm leading-relaxed text-[#c8cdd9]">
                  {profile.bio}
                </p>
              ) : (
                <p className="mb-4 text-sm italic text-[#626775]">
                  {profile.relationship.isMe
                    ? "Thêm vài dòng giới thiệu về bạn..."
                    : "Chưa có tiểu sử."}
                </p>
              )}
              <ul className="space-y-2 text-[13px]">
                {birthdayText && (
                  <InfoRow
                    icon="calendar"
                    primary={`${birthdayText}${age ? ` (${age} tuổi)` : ""}`}
                  />
                )}
                {profile.location && (
                  <InfoRow icon="mapPin" primary={profile.location} />
                )}
                {profile.occupation && (
                  <InfoRow icon="briefcase" primary={profile.occupation} />
                )}
                {profile.education && (
                  <InfoRow icon="graduationCap" primary={profile.education} />
                )}
                {profile.relationshipStatus &&
                  profile.relationshipStatus in REL_LABELS && (
                    <InfoRow
                      icon="heartFilled"
                      primary={REL_LABELS[profile.relationshipStatus]}
                    />
                  )}
                {profile.gender && profile.gender in GENDER_LABELS && (
                  <InfoRow icon="user" primary={GENDER_LABELS[profile.gender]} />
                )}
                {profile.phone && (
                  <InfoRow icon="phoneCall" primary={profile.phone} />
                )}
                {profile.website && (
                  <InfoRow
                    icon="link"
                    primary={
                      <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#ff2e93] hover:underline"
                      >
                        {profile.website.replace(/^https?:\/\//, "")}
                      </a>
                    }
                  />
                )}
                {profile.hobbies && (
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[#626775]">
                      Sở thích
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.hobbies
                        .split(",")
                        .map((h) => h.trim())
                        .filter(Boolean)
                        .map((h) => (
                          <span
                            key={h}
                            className="rounded-full bg-white/5 px-2.5 py-0.5 text-[12px] text-[#a0a5b5]"
                          >
                            #{h.replace(/\s+/g, "")}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </ul>
              {profile.relationship.isMe &&
                !profile.bio &&
                !profile.location &&
                !profile.occupation && (
                  <button
                    type="button"
                    onClick={() => setShowEdit(true)}
                    className="mt-3 w-full rounded-full border border-dashed border-white/20 py-2 text-[12px] text-[#a0a5b5] transition-colors hover:bg-white/5"
                  >
                    + Thêm thông tin
                  </button>
                )}
            </section>
          </aside>

          {/* Right: posts grid */}
          <section className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Bài viết</h2>
              <span className="text-[12px] text-[#626775]">
                {posts.length} bài
              </span>
            </div>
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
                <p className="text-[#626775]">
                  {profile.relationship.isMe
                    ? "Bạn chưa đăng bài viết nào."
                    : "Người dùng này chưa có bài viết công khai."}
                </p>
              </div>
            ) : (
              <div
                id="posts-grid"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              >
                {posts.map((p) => (
                  <ProfileMedia
                    key={p.id}
                    post={p}
                    isMe={profile.relationship.isMe}
                    onOpen={() => setOpenPostId(p.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modals */}
      {showEdit && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEdit(false)}
          onSaved={loadProfile}
        />
      )}
      {openList && (
        <ListModal
          title={
            openList === "friends"
              ? "Bạn bè"
              : openList === "followers"
                ? "Follower"
                : "Đang follow"
          }
          users={listUsers}
          onClose={() => setOpenList(null)}
        />
      )}
      {openList && listLoading && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          Đang tải...
        </div>
      )}

      {openPostId && (
        <PostDetailModal
          postId={openPostId}
          onClose={() => setOpenPostId(null)}
          onChanged={loadProfile}
        />
      )}

      {error && profile && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-200 backdrop-blur">
          {error}
        </div>
      )}
    </div>
  );
}
function StatButton({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-2xl border border-white/10 bg-[rgba(31,33,40,0.63)] p-4 text-center backdrop-blur transition-colors ${
        onClick ? "hover:bg-white/5" : ""
      }`}
    >
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[12px] text-[#a0a5b5]">{label}</p>
    </Tag>
  );
}

function InfoRow({
  icon,
  primary,
}: {
  icon: string;
  primary: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] text-[#c8cdd9]">
      <span className="flex size-4 shrink-0 items-center justify-center text-[#a0a5b5]">
        <Icon name={icon as any} size={14} />
      </span>
      <span className="flex-1 break-all">{primary}</span>
    </li>
  );
}

/**
 * Small "Gương vô hình" badge shown next to a profile's name. Pulls
 * the closeness record between the viewer and this profile, then
 * renders a compact pill:
 *   - 403 / not a friend → "Chưa kết bạn" hint
 *   - 0 points            → just the streak / locked state
 *   - some points         → progress bar with the imageFull target
 *
 * Pure cosmetic — clicking the badge is intentionally a no-op so the
 * surrounding buttons stay the primary call to action.
 */
function ClosenessBadge({
  profileUserId,
  myId,
}: {
  profileUserId: string;
  myId: string | null;
}) {
  // Use the "friends" lens as the baseline for the header — it gives
  // a reasonable middle-ground threshold that any friend-tier viewer
  // can read. The per-post mirror (in PostDetailModal/FeedMedia) still
  // applies the actual lens at render time.
  //
  // When the viewer is on their own profile, the API would 400 with
  // `friendId === myId` so we short-circuit to `null` and render the
  // badge as a no-op.
  const { info, loading } = useCloseness(
    profileUserId && myId && profileUserId !== myId ? profileUserId : null,
    "friends",
  );

  if (loading && !info) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
        <Icon name="eyePreview" size={11} />
        Đang tải điểm thân thiết…
      </span>
    );
  }

  if (!info) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[11px] text-amber-300/90"
        title="Kết bạn để bắt đầu tích điểm thân thiết."
      >
        <Icon name="lockSmall" size={11} />
        Chưa kết bạn · 0/{MIRROR_CONFIG.imageFullPoints}đ
      </span>
    );
  }

  const pct = Math.min(
    (info.points / info.requiredImageFull) * 100,
    100,
  );
  const videoReady = info.videoUnlocked;

  return (
    <span
      className="group flex items-center gap-2 rounded-full border border-teal-500/25 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-violet-500/10 px-3 py-1 text-[12px] text-white/85"
      title="Điểm thân thiết giữa bạn và người này"
    >
      <Icon name="eyePreview" size={12} className="text-teal-300" />
      <span className="font-semibold text-teal-200">{info.points}</span>
      <span className="text-white/55">/ {info.requiredImageFull}đ</span>
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/15 sm:inline-block">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="flex items-center gap-1 text-white/65">
        <Icon name="clock" size={11} className="text-amber-300" />
        {info.streakDays}d
      </span>
      <span
        className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          videoReady
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-amber-500/20 text-amber-300"
        }`}
        title={
          videoReady
            ? "Đã đủ điểm mở khóa video"
            : `Cần ${info.requiredVideoUnlock}đ để mở video`
        }
      >
        <Icon name="playCircle" size={10} className={videoReady ? "text-emerald-300" : "text-amber-300"} />
        <span>{videoReady ? "Mở" : "Khóa"}</span>
      </span>
    </span>
  );
}

/**
 * Profile-grid media tile with the "Gương vô hình" rules applied:
 *   - own posts                       → always unblurred
 *   - public posts                    → mirror disabled
 *   - friends posts                   → blur / lock per LENS_MIRROR_CONFIG.friends
 *   - close posts                     → blur / lock per LENS_MIRROR_CONFIG.close
 *
 * The thumbnail is intentionally small (aspect-square), so we keep the
 * overlay minimal — only a tiny badge in the corner + a hover hint.
 */
function ProfileMedia({
  post,
  isMe,
  onOpen,
}: {
  post: PostItem;
  isMe: boolean;
  onOpen: () => void;
}) {
  const { info: closeness } = useCloseness(
    isMe ? null : post.userId,
    post.lens,
  );

  const mirrorActive = !isMe && post.lens !== "public" && closeness?.mirrorEnabled;
  const blurPx = mirrorActive ? closeness!.imageBlur : 0;
  const videoUnlocked = mirrorActive ? closeness!.videoUnlocked : true;
  const points = closeness?.points ?? 0;
  const requiredVideoUnlock = closeness?.requiredVideoUnlock ?? 0;

  const isVideo = post.mediaType?.startsWith("video");
  const videoLocked = isVideo && !videoUnlocked;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-[#171920]"
    >
      {/* Image (with optional blur) */}
      {!isVideo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt=""
          className="size-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
          decoding="async"
          style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined }}
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.opacity = "0";
          }}
        />
      )}

      {/* Video: blurred thumbnail if locked, otherwise muted preview */}
      {isVideo && (
        <>
          {/* Cloudinary video thumbnail for preview grid */}
          <img
            src={post.mediaUrl.replace(
              /\/(video)\/upload\/(f_auto,q_auto\/)?/,
              "/$1/upload/f_jpg,q_auto,w_400/"
            )}
            alt=""
            aria-hidden
            className="size-full object-cover"
            style={{
              filter: videoLocked
                ? "blur(10px)"
                : blurPx > 0
                ? `blur(${blurPx}px)`
                : undefined,
            }}
            onError={(e) => {
              // Fallback: hide if thumbnail generation fails
              const el = e.target as HTMLImageElement;
              el.style.opacity = "0";
            }}
          />
          {videoLocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white">
              <span className="flex size-7 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
                <Icon name="playCircle" size={14} className="text-amber-300" />
              </span>
              <span className="text-[9px] font-semibold">Video bị khóa</span>
              <span className="text-[8px] text-white/70">
                {points}/{requiredVideoUnlock}
              </span>
            </div>
          ) : (
            /* Play icon for unlocked video thumbnails */
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex size-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                <Icon name="playCircle" size={20} className="text-white" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Mirror badge for blurred images */}
      {!isVideo && blurPx > 0 && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full border border-white/20 bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
          <Icon name="eyePreview" size={9} />
          Mờ {blurPx}px
        </span>
      )}

      {/* Lens badge for friends-only posts (public = no badge needed) */}
      {post.lens === "friends" && (
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white backdrop-blur">
          <Icon name="users2" size={9} />
          Bạn bè
        </span>
      )}
      {post.lens === "close" && (
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/20 px-1.5 py-0.5 text-[9px] text-white backdrop-blur">
          <Icon name="lockOverlay" size={9} />
          Thân thiết
        </span>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="line-clamp-2 text-[11px] text-white">{post.caption}</p>
        </div>
      )}
    </div>
  );
}
