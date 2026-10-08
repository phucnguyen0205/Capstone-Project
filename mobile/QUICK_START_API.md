# 🚀 QUICK START GUIDE - Sử dụng API mới

## 📦 Import

```dart
// API Service với tất cả extensions
import 'package:pulo/core/services/api_service.dart';

// Models
import 'package:pulo/core/models/models.dart';
```

## 🔧 Khởi tạo

```dart
final api = ApiService();
api.setAuthToken(yourJwtToken);
```

---

## 📝 COMMENTS - Reactions & Replies

```dart
// Toggle emoji reaction
final result = await api.toggleCommentReaction(commentId, '❤️');
print('Reacted: ${result['reacted']}');

// Load replies
final replies = await api.getCommentReplies(commentId);
for (var reply in replies) {
  final comment = CommentModel.fromJson(reply);
  print('${comment.author}: ${comment.content}');
}

// Edit comment
await api.updateComment(commentId, 'Updated content');

// Delete comment
await api.deleteComment(commentId);

// Report comment
await api.reportComment(commentId, reason: 'spam', description: 'Spam content');

// Share comment
await api.shareComment(commentId, to: friendId);
```

---

## 📞 CALLS V2 - Socket.IO WebRTC

```dart
// Get ICE servers first
final iceConfig = await api.getIceServers();
final iceServers = iceConfig['iceServers'] as List;

// Initiate call
final call = await api.initiateCallV2(
  conversationId: convId,
  calleeId: friendId,
  calleeName: 'John Doe',
  calleeAvatar: 'https://...',
  isGroup: false,
);
final callId = call['call']['id'];

// Answer call
await api.answerCallV2(callId: callId, action: 'accept');

// Mark connected (when WebRTC connects)
await api.markCallConnected(callId);

// End call
await api.answerCallV2(callId: callId, action: 'end');
```

---

## 💬 CONVERSATION MEMBERS

```dart
// Get members
final members = await api.getConversationMembers(conversationId);
for (var m in members) {
  final member = GroupMemberModel.fromJson(m);
  print('${member.username} - ${member.role}');
}

// Add member
await api.addConversationMember(
  conversationId,
  userId: newUserId,
  nickname: 'Johnny',
  role: 'member',
);

// Update nickname/role
await api.updateConversationMember(
  conversationId,
  userId: userId,
  nickname: 'New Nickname',
  role: 'admin',
);

// Kick member
await api.removeConversationMember(conversationId, userId);
```

---

## 👥 GROUPS - Full Management

```dart
// Create group
final group = await api.createGroup(
  name: 'My Group',
  description: 'Group description',
  visibility: 'private',
  avatarUrl: 'https://...',
);
final groupId = group['id'];

// Get group detail
final detail = await api.getGroupDetail(groupId);
final groupModel = GroupModel.fromJson(detail);

// Update group
await api.updateGroup(
  groupId,
  name: 'New Name',
  description: 'New description',
);

// Join public group
await api.joinGroup(groupId);

// Leave group
await api.leaveGroup(groupId);

// Get members
final members = await api.getGroupMembers(groupId);

// Get activity
final activity = await api.getGroupActivity(groupId);
for (var act in activity) {
  final actModel = GroupActivityModel.fromJson(act);
  print('${actModel.type} at ${actModel.timestamp}');
}

// Get gallery
final gallery = await api.getGroupGallery(groupId);

// Get posts
final posts = await api.getGroupPosts(groupId);

// Add post to group
await api.addPostToGroup(groupId, postId);

// Transfer ownership
await api.transferGroupOwnership(groupId, newOwnerId);

// Delete group
await api.deleteGroup(groupId);
```

---

## 🔍 GROUPS - Discovery & Closeness

```dart
// Discover groups
final groups = await api.discoverGroups(query: 'flutter', limit: 20);

// Get closeness with all friends
final closeness = await api.getGroupCloseness();
final items = closeness['items'] as List;
for (var item in items) {
  final info = ClosenessInfoModel.fromJson(item);
  print('${info.friendId}: ${info.points} points (${info.tier})');
}

// Get closeness with specific friend
final friendCloseness = await api.getFriendCloseness(friendId);
final info = ClosenessInfoModel.fromJson(friendCloseness);
print('Tier: ${info.tier}, Points: ${info.points}');
```

---

## 📓 DIARY & ENCOUNTERS

```dart
// Record encounter action
await api.recordDiaryEncounter(
  encounterId: encId,
  action: 'view', // 'view' | 'dismiss' | 'note'
  note: 'Met at coffee shop',
);

// Parse encounter
final encounter = DiaryEncounterModel.fromJson(json);
if (encounter.isPending) {
  print('New encounter with ${encounter.closenessPoints} points');
}
```

---

## 🎬 REELS

```dart
// Explore reels
final reels = await api.exploreReels();
for (var r in reels) {
  final reel = ReelModel.fromJson(r);
  if (reel.canView) {
    print('Can watch: ${reel.videoUrl}');
  } else if (reel.needsUnlock) {
    print('Need ${reel.unlockPoints} points to unlock');
  }
}

// Get my reels
final myReels = await api.getMyReels();

// Unlock reel
final unlocked = await api.unlockReel(reelId);
if (unlocked['unlocked'] == true) {
  print('Unlocked successfully!');
}
```

---

## 🔐 VAULT - Advanced Visibility

```dart
// Update note
await api.updateVaultNote(
  noteId,
  content: 'Updated content',
  mood: 'happy',
  unlockPoints: 100,
  visibility: 'friends',
);

// Get visibility list (who can see this note)
final visibilityList = await api.getNoteVisibilityList(noteId);
for (var v in visibilityList) {
  final vis = VisibilityRowModel.fromJson(v);
  print('${vis.userId}: ${vis.state} (mood: ${vis.moodFilter})');
}

// Update visibility for a user
await api.updateNoteVisibility(
  noteId,
  userId: friendId,
  state: 'allow', // 'allow' | 'deny'
  moodFilter: 'happy', // optional
);

// Preview visibility
final preview = await api.previewNoteVisibility(noteId);
print('Can view: ${preview['allowed']}');

// Get vault feed (notes from friends)
final feed = await api.getVaultFeed();
for (var note in feed) {
  final vaultNote = VaultNoteModel.fromJson(note);
  print('${vaultNote.mood}: ${vaultNote.content}');
}

// Get friends for vault sharing
final friends = await api.getVaultFriends();
```

---

## 🛠 UTILITY

```dart
// Get avatar URL
final avatarUrl = await api.getAvatarUrl(userId);

// Delete uploaded file
await api.deleteUpload(publicId);
```

---

## 📡 RADAR

```dart
// Parse radar users
final radarData = await fetchRadarData(); // your API call
for (var user in radarData) {
  final radarUser = RadarUserModel.fromJson(user);
  
  if (radarUser.isFriend) {
    print('Friend: ${radarUser.name}');
  } else if (radarUser.isActive) {
    print('Active: ${radarUser.name}');
  } else if (radarUser.isStranger) {
    print('Stranger: ${radarUser.name}');
  }
  
  if (radarUser.isOnline) {
    print('🟢 Online now');
  }
  
  if (radarUser.distance != null) {
    print('Distance: ${radarUser.distance}m');
  }
}
```

---

## 🤖 AI FEATURES

```dart
// Moderation result
final modResult = AiModerationResult.fromJson(moderationJson);
if (!modResult.passed) {
  print('Content blocked: ${modResult.reason}');
  print('Categories: ${modResult.categories.join(', ')}');
}

// Compatibility ranking
final compatResults = await fetchCompatibility();
for (var result in compatResults) {
  final compat = CompatibilityResult.fromJson(result);
  print('User ${compat.userId}: ${compat.scorePercent}');
  
  if (compat.isHighCompatibility) {
    print('⭐ High match!');
  }
}
```

---

## 💬 MESSAGES

```dart
// Parse message
final message = MessageModel.fromJson(messageJson);

// Check media type
if (message.hasMedia) {
  if (message.isImage) {
    showImage(message.mediaUrl!);
  } else if (message.isVideo) {
    playVideo(message.mediaUrl!);
  } else if (message.isFile) {
    downloadFile(message.mediaUrl!, message.fileName!);
  }
}

// Check if deleted
if (message.isDeleted) {
  print('This message was deleted');
}

// Check if edited
if (message.isEdited == true) {
  print('Edited at ${message.updatedAt}');
}
```

---

## 🎯 ERROR HANDLING

```dart
try {
  await api.someMethod();
} on ApiException catch (e) {
  print('API Error: ${e.message}');
  if (e.statusCode == 404) {
    print('Not found');
  } else if (e.statusCode == 409) {
    print('Conflict - already exists or busy');
  }
} catch (e) {
  print('Unknown error: $e');
}
```

---

## 🔄 EXAMPLE: Complete Chat Flow

```dart
// 1. Create conversation
final conv = await api.createConversation(friendId);
final conversationId = conv['id'];

// 2. Get members
final members = await api.getConversationMembers(conversationId);

// 3. Send text message
await api.sendMessage(conversationId, 'Hello!');

// 4. Send media message
await api.sendMessageWithMedia(
  conversationId,
  content: 'Check this out!',
  mediaUrl: 'https://cloudinary.com/...',
  mediaType: 'image',
);

// 5. Get messages
final messages = await api.getMessages(conversationId);
for (var msg in messages) {
  final message = MessageModel.fromJson(msg);
  print('${message.sender?['name']}: ${message.content}');
}

// 6. Delete message
await api.deleteMessage(messageId);
```

---

## ✅ CHECKLIST INTEGRATION

Khi implement UI, đảm bảo:
- [ ] Error handling cho mọi API call
- [ ] Loading states (CircularProgressIndicator)
- [ ] Optimistic updates (like, save)
- [ ] Pagination cho lists
- [ ] Pull-to-refresh
- [ ] Debounce cho search (300ms)
- [ ] Cache images (cached_network_image)
- [ ] Retry mechanism cho failed requests
- [ ] Offline mode detection
- [ ] Toast/Snackbar cho feedback

---

## 📚 TÀI LIỆU THAM KHẢO

- `WEB_FEATURES_ANALYSIS.md` - Chi tiết 80 endpoints
- `SUMMARY_MOBILE_INTEGRATION.md` - Tổng hợp
- `PROGRESS_REPORT.md` - Tiến độ
- Web backend code: `/Users/nhungnguyen/Documents/Capstone Project/src/app/api/`

---

**🎉 Bây giờ bạn có thể gọi TẤT CẢ 103 API endpoints từ Flutter app!**
