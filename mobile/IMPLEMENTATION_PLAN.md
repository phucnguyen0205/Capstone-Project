# IMPLEMENTATION PLAN - Mobile App Integration

## Status: READY TO BEGIN
Base: ApiService có ~60/80 endpoints, còn thiếu ~20 endpoints

---

## MISSING API ENDPOINTS (Cần bổ sung)

### Auth & Profile
- ✅ POST /api/auth/google/exchange (đã có)
- ⚠️ PATCH /api/users/[id] (có updateMe nhưng cần check updateOtherUser)
- ✅ POST /api/users/[id]/follow (đã có)
- ✅ GET /api/users/[id]/friends (đã có)
- ✅ GET /api/users/[id]/posts (đã có)

### Posts & Comments
- ⚠️ POST /api/posts/comments/[id]/reaction (cần thêm)
- ⚠️ GET /api/posts/comments/[id]/replies (cần thêm)
- ⚠️ PATCH /api/posts/comments/[id] (cần thêm edit comment)
- ⚠️ DELETE /api/posts/comments/[id] (cần thêm delete comment)
- ⚠️ POST /api/posts/comments/[id]/report (cần thêm report comment)
- ⚠️ POST /api/posts/comments/[id]/share (cần thêm share comment)

### Conversations & Members
- ⚠️ GET /api/conversations/[id]/members (cần thêm)
- ⚠️ POST /api/conversations/[id]/members (add member - cần thêm)
- ⚠️ PATCH /api/conversations/[id]/members (update nickname/role - cần thêm)
- ⚠️ DELETE /api/conversations/[id]/members/[userId] (kick - cần thêm)

### Calls v2 (Socket.IO + Redis)
- ⚠️ POST /api/calls/v2/initiate (cần thêm)
- ⚠️ POST /api/calls/v2/answer (cần thêm)
- ⚠️ POST /api/calls/v2/connected (cần thêm)
- ⚠️ GET /api/calls/v2/ice-servers (cần thêm)

### Groups Advanced
- ⚠️ POST /api/groups (tạo group - cần thêm)
- ⚠️ PATCH /api/groups/[id] (update group - cần thêm)
- ⚠️ DELETE /api/groups/[id] (delete group - cần thêm)
- ⚠️ POST /api/groups/[id]/join (cần thêm)
- ⚠️ POST /api/groups/[id]/leave (cần thêm)
- ⚠️ GET /api/groups/[id]/members (cần thêm)
- ⚠️ GET /api/groups/[id]/activity (cần thêm)
- ⚠️ GET /api/groups/[id]/gallery (cần thêm)
- ⚠️ POST /api/groups/[id]/posts (add post to group - cần thêm)
- ⚠️ POST /api/groups/[id]/transfer-ownership (cần thêm)
- ⚠️ GET /api/groups/discover (cần thêm)
- ⚠️ GET /api/groups/closeness (cần thêm)
- ⚠️ GET /api/groups/closeness/[friendId] (cần thêm)

### Reels
- ⚠️ GET /api/reels/explore (cần thêm)
- ⚠️ GET /api/reels/mine (cần thêm)
- ⚠️ POST /api/reels/[id]/unlock (cần thêm)

### Vault Advanced
- ⚠️ PATCH /api/vault/notes/[id] (update note - cần thêm)
- ⚠️ GET /api/vault/notes/[id]/visibility (cần thêm)
- ⚠️ PUT /api/vault/notes/[id]/visibility (cần thêm)
- ⚠️ GET /api/vault/notes/[id]/visibility/preview (cần thêm)
- ⚠️ GET /api/vault/feed (cần thêm)
- ⚠️ GET /api/vault/friends (cần thêm)

### Diary
- ⚠️ POST /api/diary/encounters (cần thêm)

### Avatar & Upload
- ⚠️ GET /api/avatar (cần thêm)
- ⚠️ DELETE /api/upload/confirm (cần thêm)

---

## MODELS CẦN TẠO/BỔ SUNG

### Hiện có (lib/core/models/)
- ✅ user_model.dart
- ✅ post_model.dart
- ✅ comment_model.dart
- ✅ conversation_model.dart
- ✅ notification_model.dart
- ✅ group_model.dart
- ✅ group_member_model.dart
- ✅ group_tier_model.dart
- ✅ group_activity_model.dart
- ✅ vault_note_model.dart
- ✅ presence_info_model.dart
- ✅ call_types.dart
- ✅ incoming_call_model.dart

### Cần tạo mới
- [ ] message_model.dart (cho chat)
- [ ] reel_model.dart
- [ ] diary_encounter_model.dart
- [ ] radar_user_model.dart
- [ ] friend_request_model.dart
- [ ] visibility_row_model.dart (cho vault)
- [ ] closeness_info_model.dart (cho groups)
- [ ] tier_model.dart
- [ ] ai_moderation_result_model.dart
- [ ] compatibility_result_model.dart

---

## UI FEATURES CẦN IMPLEMENT

### Phase 1: Core (CRITICAL)
- [ ] 1.1 Complete Auth Flow
  - [ ] Phone OTP complete
  - [ ] Google OAuth exchange mobile
  - [ ] Profile completion after signup
  
- [ ] 1.2 Posts & Feed
  - [ ] Feed tabs (For You / Following)
  - [ ] Create post with Cloudinary
  - [ ] Like/Save optimistic updates
  - [ ] Comments với replies
  - [ ] Reaction emoji cho comments
  - [ ] Share modal
  
- [ ] 1.3 Chat Complete
  - [ ] Conversation list với presence
  - [ ] Message input với emoji picker
  - [ ] Media/file attachment
  - [ ] Group chat management
  - [ ] Member management (add/kick/role)
  - [ ] Chat settings (theme, nickname)

### Phase 2: Advanced Communication
- [ ] 2.1 Calls v2 (Socket.IO)
  - [ ] Integrate call_socket_service
  - [ ] ICE servers config
  - [ ] Incoming call UI
  - [ ] In-call controls
  
- [ ] 2.2 Presence System
  - [ ] Heartbeat timer
  - [ ] Bulk presence check
  - [ ] Online indicators UI
  
- [ ] 2.3 Notifications Complete
  - [ ] Bell với badge
  - [ ] Notification list với types
  - [ ] Mark read/delete
  - [ ] Real-time polling

### Phase 3: Groups & Social
- [ ] 3.1 Groups Management
  - [ ] Create/edit/delete group
  - [ ] Join/leave
  - [ ] Member panel với roles
  - [ ] Activity feed
  - [ ] Gallery
  - [ ] Transfer ownership
  
- [ ] 3.2 Groups Advanced
  - [ ] Tiers system UI
  - [ ] Closeness scores
  - [ ] Discover groups
  
- [ ] 3.3 Friend Requests
  - [ ] Send/accept/decline UI
  - [ ] Requests list
  
- [ ] 3.4 Discover
  - [ ] AI compatibility ranking
  - [ ] User cards
  - [ ] Swipe actions

### Phase 4: Unique Features
- [ ] 4.1 Vault Complete
  - [ ] Note creation với mood
  - [ ] Visibility management
  - [ ] Unlock points
  - [ ] Allow/deny list
  - [ ] Mood filter
  - [ ] Feed from friends
  
- [ ] 4.2 Diary
  - [ ] Encounters today
  - [ ] History 30 days
  - [ ] Actions (view/dismiss/note)
  
- [ ] 4.3 Radar
  - [ ] 6 users layout
  - [ ] 3 tiers (friends/active/strangers)
  - [ ] Real-time updates
  
- [ ] 4.4 Reels
  - [ ] Explore feed
  - [ ] Mine reels
  - [ ] Unlock với closeness
  - [ ] Player UI (TikTok-style)
  
- [ ] 4.5 Quiz
  - [ ] Personality test UI
  - [ ] Results display

### Phase 5: Polish
- [ ] 5.1 AI Integration
  - [ ] Moderation pipeline
  - [ ] Discover ranking
  
- [ ] 5.2 Upload System
  - [ ] Cloudinary với progress
  - [ ] Avatar upload
  - [ ] Media preview
  
- [ ] 5.3 Search
  - [ ] Users search
  - [ ] Groups search
  - [ ] Debounce 300ms
  
- [ ] 5.4 Misc
  - [ ] Error handling toàn app
  - [ ] Loading states
  - [ ] Pagination
  - [ ] Offline support
  - [ ] Deep linking

---

## EXECUTION ORDER

### Week 1: API Layer + Models
1. Bổ sung 20 endpoints còn thiếu vào ApiService
2. Tạo 10 models mới
3. Test API calls

### Week 2: Core Features
1. Complete Auth (OTP + Google)
2. Posts & Feed với comments
3. Chat với media

### Week 3: Advanced Communication
1. Calls v2
2. Presence
3. Notifications

### Week 4: Groups & Social
1. Groups CRUD
2. Friend requests
3. Discover

### Week 5: Unique Features
1. Vault
2. Diary
3. Radar
4. Reels

### Week 6: Polish
1. AI integration
2. Error handling
3. Testing
4. Optimization

---

## READY TO START
Bắt đầu với: Bổ sung 20 API endpoints còn thiếu
