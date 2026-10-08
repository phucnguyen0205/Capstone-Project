class MockData {
  // Current user profile
  static const Map<String, dynamic> currentUser = {
    'name': 'Name',
    'avatar': null,
  };
  
  // Swipe profiles
  static const List<Map<String, dynamic>> swipeProfiles = [
    {
      'id': '1',
      'name': 'Name',
      'age': 22,
      'location': 'Quận 1, TP. Hồ Chí Minh',
      'distance': '3.2 km',
      'bio': 'Thích nghe nhạc indie, nhâm nhi cafe vào ngày mưa. Tìm kiếm một tâm hồn đồng điệu ✨',
      'matchPercentage': 96,
      'avatar': null,
    },
    {
      'id': '2',
      'name': 'Minh',
      'age': 25,
      'location': 'Quận 3, TP. Hồ Chí Minh',
      'distance': '5.1 km',
      'bio': 'Yêu nghệ thuật, thích du lịch và khám phá ẩm thực mới',
      'matchPercentage': 89,
      'avatar': null,
    },
  ];
  
  // Video feed
  static const List<Map<String, dynamic>> videoFeed = [
    {
      'id': '1',
      'username': '@hoang_nam_acoustic',
      'creatorAvatar': null,
      'title': 'Chương trình đêm nhạc acoustic thu nhỏ tại nhà 🎸🎙️',
      'description': 'Thử hát lại bản tình ca xưa cũ dưới góc nhìn mới...',
      'tags': ['#acoustic', '#vibehub', '#xuhuong'],
      'likes': 14500,
      'comments': 892,
      'bookmarks': 1200,
      'thumbnail': null,
    },
  ];
  
  // Trending carousel
  static const List<Map<String, dynamic>> trendingList = [
    {
      'id': '1',
      'title': 'Phố Đêm Acoustic',
      'views': '128K views',
      'thumbnail': null,
    },
    {
      'id': '2',
      'title': 'Vibe mùa thu ấm áp',
      'views': '94K views',
      'thumbnail': null,
    },
    {
      'id': '3',
      'title': 'DJ Set Remix',
      'views': '210K views',
      'thumbnail': null,
    },
    {
      'id': '4',
      'title': 'Indie Chill Cafe',
      'views': '56K views',
      'thumbnail': null,
    },
  ];
  
  // Conversations
  static const List<Map<String, dynamic>> conversations = [
    {
      'id': '1',
      'name': 'Name 1',
      'avatar': null,
      'lastMessage': 'Hôm nay đi uống trà sữa đi!',
      'time': '14:32',
      'unreadCount': 2,
      'isOnline': false,
    },
    {
      'id': '2',
      'name': 'Name 2',
      'avatar': null,
      'lastMessage': 'Có rảnh không? Chút đi đá bóng nha',
      'time': '11:15',
      'unreadCount': 0,
      'isOnline': false,
    },
    {
      'id': '3',
      'name': 'Name 3',
      'avatar': null,
      'lastMessage': 'Gửi tớ link bản phối nhạc kia nha',
      'time': 'Hôm qua',
      'unreadCount': 0,
      'isOnline': true,
    },
  ];
  
  // Chat messages
  static const List<Map<String, dynamic>> chatMessages = [
    {
      'id': '1',
      'senderId': 'other',
      'message': 'Nghe thử bản acoustic của cậu mê quá trời luôn á!',
      'time': '14:30',
    },
    {
      'id': '2',
      'senderId': 'me',
      'message': 'Cảm ơn cậu nhiều nha! Tối nay đi cafe rồi tớ đệm đàn cho hát nhé?',
      'time': '14:31',
    },
  ];
  
  // Filter options
  static const Map<String, dynamic> filterOptions = {
    'ageRange': [18, 25],
    'interests': ['Âm nhạc', 'Du lịch', 'Nghệ thuật', 'Thể thao', 'Ẩm thực'],
  };
  
  // Interest chips
  static const List<String> interestChips = [
    'Âm nhạc',
    'Du lịch',
    'Nghệ thuật',
    'Thể thao',
    'Ẩm thực',
  ];
}
