export const navTabs = [
  { id: "home", label: "Trang chủ", icon: "home" as const, active: true },
  { id: "explore", label: "Khám phá", icon: "compass" as const, active: false },
  { id: "messages", label: "Tin nhắn", icon: "messageCircle" as const, active: false },
  { id: "groups", label: "Nhóm", icon: "heartHandshake" as const, active: false },
];

export const interests = [
  { label: "Âm nhạc", active: true },
  { label: "Cafe", active: true },
  { label: "Du lịch", active: false },
  { label: "Thể thao", active: false },
  { label: "Đọc sách", active: false },
];

export const trendingItems = [
  { title: "Phố Đêm Acoustic", views: "128K views", image: "thumb1" as const },
  { title: "Vibe mùa thu ấm áp", views: "94K views", image: "thumb2" as const },
  { title: "DJ Set Remix", views: "210K views", image: "thumb3" as const },
  { title: "Indie Chill Cafe", views: "56K views", image: "thumb4" as const },
];

export const conversations = [
  {
    id: 1,
    name: "Name 1",
    message: "Hôm nay đi uống trà sữa đi!",
    time: "14:32",
    unread: 2,
    avatar: "avatar1" as const,
    active: true,
  },
  {
    id: 2,
    name: "Name 2",
    message: "Có rảnh không? Chút đi đá bóng nha",
    time: "11:15",
    unread: 0,
    avatar: null,
    active: false,
  },
  {
    id: 3,
    name: "Name 3",
    message: "Gửi tớ link bản phối nhạc kia nha",
    time: "Hôm qua",
    unread: 0,
    avatar: "avatar3" as const,
    active: false,
  },
];

export const chatMessages = [
  {
    id: 1,
    type: "received" as const,
    text: "Nghe thử bản acoustic của cậu mê quá trời luôn á!",
  },
  {
    id: 2,
    type: "sent" as const,
    text: "Cảm ơn cậu nhiều nha! Tối nay đi cafe rồi tớ đệm đàn cho hát nhé?",
  },
];

export const videoActions = [
  { label: "14.5K", icon: "heartFilled" as const, gradient: true },
  { label: "892", icon: "messageCircleAlt" as const, gradient: false },
  { label: "1.2K", icon: "bookmark" as const, gradient: false },
  { label: "Chia sẻ", icon: "arrowUpRight" as const, gradient: false },
];
