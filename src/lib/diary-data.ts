export const personas = [
  {
    id: "public",
    title: "Công khai (Tier 1)",
    badge: "Mở rộng",
    badgeClass: "bg-blue-500/10 text-[#08f]",
    description: "Nghiêm túc, hướng ngoại, thích kết nối công việc & xã hội.",
    active: true,
  },
  {
    id: "friends",
    title: "Bè bạn (Tier 2)",
    badge: "Vui vẻ",
    badgeClass: "bg-emerald-500/10 text-emerald-400",
    description: "Hài hước, phiêu lưu, chia sẻ khoảnh khắc vui tươi.",
    active: false,
  },
  {
    id: "close",
    title: "Bạn thân (Tier 3-4)",
    badge: "Bí mật",
    badgeClass: "bg-violet-500/10 text-[#9b51e0]",
    description: "Nhạy cảm, hay dỗi, thích xem phim kinh dị một mình lúc 2h sáng.",
    active: false,
    locked: true,
  },
];

export const hiddenTraits = [
  "Hay dỗi",
  "Mê phim kinh dị",
  "Nhạy cảm",
  "Lãng mạn bí mật",
];

export const privacyTiers = [
  { label: "Cấp 1", active: false },
  { label: "Cấp 2", active: true },
  { label: "Cấp 3", active: false },
  { label: "Cấp 4", active: false },
];

export const diaryPosts = [
  {
    id: 1,
    author: "User 1",
    time: "2 giờ trước",
    avatar: "avatarPic" as const,
    image: "postPhoto" as const,
    caption:
      "Hậu trường chuyến Đà Lạt đi săn mây dở khóc dở cười 🤣 Lạnh muốn xỉu nhưng xứng đáng lắm cả nhà ơi!",
    selectedLens: "Bè bạn",
    likes: 24,
    comments: 12,
    blurred: true,
  },
  {
    id: 2,
    author: "User2",
    time: "5 giờ trước",
    avatar: null,
    image: null,
    caption:
      "Đà Lạt đẹp quá ❤️ Chắc chuyển lên đây ở luôn cho thơ mộng quá các bạn ơi!",
    selectedLens: "Công khai",
    likes: 0,
    comments: 0,
    blurred: false,
  },
  {
    id: 3,
    author: "Nguyễn Minh Anh",
    time: "1 ngày trước",
    avatar: null,
    image: null,
    caption:
      "Nội dung Cấp 3+ — Tăng độ thân thiết để mở khóa",
    selectedLens: null,
    likes: 0,
    comments: 0,
    blurred: false,
    lockedTier: true,
  },
];

export const radarMatches = [
  {
    name: "Minh Anh",
    distance: "15m",
    affinity: "92% cùng tần số",
    affinityClass: "text-cyan-400",
    canInvite: true,
  },
  {
    name: "Hà Linh",
    distance: "45m",
    affinity: "78% tần số tương đồng",
    affinityClass: "text-[#94a3b8]",
    canInvite: false,
  },
];

export const recentEncounter = {
  name: "User 3",
  location: "Vừa đi ngang qua bạn tại Phố đi bộ",
  streak: "🔥 7 ngày liên tiếp",
};

export const vaultInfo = {
  title: "Mood Dump — Chỉ mình bạn thấy",
  subtitle: "3 ghi chú mới lưu trữ bảo mật",
};

export const mirrorProgress = {
  percent: 67,
  title: "Gương vô hình",
  subtitle: "Tương tác thêm để rõ nét chân dung bạn thân",
};