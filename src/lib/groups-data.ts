import type { AssetKey } from "@/lib/assets";

export type TierKey = "public" | "friends" | "close" | "private";

export const tierOptions = [
  {
    key: "public" as TierKey,
    label: "Cấp 1 — Công khai",
    icon: "globe" as AssetKey,
    count: 12,
  },
  {
    key: "friends" as TierKey,
    label: "Cấp 2 — Bè bạn",
    icon: "users2" as AssetKey,
    count: 8,
  },
  {
    key: "close" as TierKey,
    label: "Cấp 3 — Thân thiết",
    icon: "heart" as AssetKey,
    count: 5,
  },
  {
    key: "private" as TierKey,
    label: "Cấp 4 — Riêng tư",
    icon: "lock" as AssetKey,
    count: 3,
  },
];

export const lensFilters = [
  { label: "👁 Tất cả", active: true },
  { label: "🌍 Công khai", active: false },
  { label: "😄 Bè bạn", active: false },
  { label: "💜 Thân thiết", active: false },
  { label: "🔒 Riêng tư", active: false },
];

export const groupMembers = [
  { name: "Minh", online: true },
  { name: "Hà", online: true },
  { name: "Tùng", online: true },
  { name: "Linh", online: true },
  { name: "An", online: false },
  { name: "Phúc", online: false },
  { name: "Mai", online: true },
  { name: "Đức", online: false },
];

export const groupPosts = [
  {
    id: 1,
    author: "Minh Anh",
    tier: "friends" as TierKey,
    tierLabel: "Cấp 2 — Bè bạn",
    tierBadgeClass: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    date: "Thứ 5, 15/08/2026 · 14:30",
    selectedLens: "😄 Bè bạn ✓",
    caption: "Hậu trường chuyến Đà Lạt — Xe hỏng giữa đường mà cười muốn xỉu 🤣🤣",
    image: "postImage1" as AssetKey,
    likes: 24,
    comments: 8,
    locked: false,
    visibility: 8,
  },
  {
    id: 2,
    author: "Tùng Lâm",
    tier: "close" as TierKey,
    tierLabel: "Cấp 3 — Thân thiết",
    tierBadgeClass: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    date: "Thứ 4, 14/08/2026 · 20:15",
    selectedLens: "😄 Bè bạn ✓",
    caption: "Tâm sự về chuyến đi...",
    image: "postImage2" as AssetKey,
    likes: 14,
    comments: 4,
    locked: "preview" as const,
    preview: {
      intimacy: 67,
      interactionsLeft: 12,
    },
    visibility: 8,
  },
  {
    id: 3,
    author: "Hà Linh",
    tier: "private" as TierKey,
    tierLabel: "Cấp 4 — Riêng tư",
    tierBadgeClass: "bg-violet-500/10 border-violet-500/20 text-violet-400",
    date: "Thứ 3, 13/08/2026 · 09:00",
    selectedLens: "💜 Bạn thân",
    avatar: "avatarHaLinh" as AssetKey,
    caption: "",
    likes: 0,
    comments: 0,
    locked: "full" as const,
    visibility: 8,
  },
];

export const galleryItems = [
  { image: "gallery1" as AssetKey, date: "14/08", type: "video" as const },
  { image: "gallery2" as AssetKey, date: "13/08", type: "photo" as const },
  { image: "gallery3" as AssetKey, date: "12/08", type: "video" as const },
  { image: "gallery4" as AssetKey, date: "11/08", type: "locked" as const },
  { image: "gallery5" as AssetKey, date: "10/08", type: "photo" as const },
];

export const recentActivities = [
  { text: "Tùng đã thích bài của Minh Anh", time: "2 giờ trước" },
  { text: "Linh đã bình luận: Trời ơi haha", time: "3 giờ trước" },
  { text: "An đã mở khóa Cấp 3", time: "1 ngày trước" },
];

export const recentMembers = [
  { name: "Mai Phương", addedBy: "Minh", time: "2 ngày trước" },
  { name: "Đức Anh", addedBy: "Hà", time: "5 ngày trước" },
];