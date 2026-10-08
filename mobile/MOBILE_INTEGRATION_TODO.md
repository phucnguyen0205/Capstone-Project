# Kế hoạch tích hợp toàn bộ tính năng Web vào Mobile

Dựa trên WEB_FEATURES_ANALYSIS.md - 80 API endpoints, 11 pages, 43 components

## Phase 1: Core Foundation (PRIORITY)
- [ ] 1.1 API Client Layer - tạo service wrappers cho 80 endpoints
- [ ] 1.2 Models - 19+ models map với database schema
- [ ] 1.3 Auth Complete - Email, Phone OTP, Google OAuth exchange
- [ ] 1.4 State Management - Riverpod providers cho tất cả features

## Phase 2: Core Features (ESSENTIAL)
- [ ] 2.1 Profile & Users - view, edit, follow, friends, search
- [ ] 2.2 Posts & Feed - create, feed (for-you + following), like, save
- [ ] 2.3 Comments - flat + reply, reactions emoji, share, report
- [ ] 2.4 Chat 1-1 - conversations, messages (text + media + file)
- [ ] 2.5 Chat Group - create, members, nickname, roles

## Phase 3: Advanced Communication (HIGH)
- [ ] 3.1 Calls WebRTC - voice + video, v2 Socket.IO
- [ ] 3.2 Calls UI - incoming modal, in-call controls
- [ ] 3.3 Presence System - heartbeat, bulk check, online indicators
- [ ] 3.4 Notifications - bell, list, types, mark read, badge

## Phase 4: Social Features (MEDIUM)
- [ ] 4.1 Groups - create, join/leave, roles, members panel
- [ ] 4.2 Groups Advanced - tiers, closeness, activity, gallery
- [ ] 4.3 Reels - explore, mine, unlock
- [ ] 4.4 Discover - compatibility AI + rules
- [ ] 4.5 Friend Requests - send, accept, decline

## Phase 5: Unique Features (LOW)
- [ ] 5.1 Vault - notes, mood, visibility, unlock points
- [ ] 5.2 Diary - encounters, history, actions
- [ ] 5.3 Radar - 6 users realtime
- [ ] 5.4 Quiz - personality test
- [ ] 5.5 Closeness - Gương vô hình (blur/lock by lens)

## Phase 6: AI & Polish (POLISH)
- [ ] 6.1 AI Moderation - integrate Gemini + rules
- [ ] 6.2 AI Discover - smart recommendations
- [ ] 6.3 Upload - Cloudinary unsigned
- [ ] 6.4 Search - users, groups, debounce
- [ ] 6.5 Recommend Feed - 6-signal algorithm

## Technical Checklist
- [ ] Error handling cho 80 endpoints
- [ ] Loading states + skeletons
- [ ] Pagination + infinite scroll
- [ ] Image caching (cached_network_image)
- [ ] Offline support (local cache)
- [ ] Push notifications (FCM)
- [ ] Deep linking
- [ ] Analytics

---

## Tiến độ hiện tại
- ✅ Cấu trúc project cơ bản
- ✅ Auth service (login, register)
- ✅ Basic API service
- ✅ WebRTC calls (partial)
- ✅ Chat basic
- ⚠️ Thiếu: 70% endpoints, Models đầy đủ, UI components, Advanced features

## Bắt đầu implement
Starting with Phase 1.1 - API Client Layer for all 80 endpoints
