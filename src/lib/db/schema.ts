import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  username: text("username").notNull().unique(),
  password: text("password"),
  name: text("name"),
  avatar: text("avatar"),
  bio: text("bio"),
  coverPhoto: text("cover_photo"),
  birthday: integer("birthday", { mode: "timestamp" }),
  location: text("location"),
  website: text("website"),
  phone: text("phone"),
  gender: text("gender"), // "male" | "female" | "other" | "prefer_not_to_say"
  occupation: text("occupation"),
  education: text("education"),
  hobbies: text("hobbies"), // comma-separated
  relationshipStatus: text("relationship_status"), // "single" | "in_relationship" | "married" | "complicated" | ""
  provider: text("provider"), // "credentials" | "google" | "phone"
  googleId: text("google_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // Group chat fields (NULL for 1-1 conversations)
  name: text("name"),
  isGroup: integer("is_group").notNull().default(0),
  avatarUrl: text("avatar_url"),
  // Linked first-class group. When `is_group=1`, this points to the
  // matching row in the `groups` table so the chat box and the
  // /groups page stay in sync. NULL for 1-1 conversations and for
  // legacy group chats that pre-date the `groups` table.
  groupId: text("group_id"),
});

export const conversationParticipants = sqliteTable("conversation_participants", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  // Group-role permissions + display-name overrides.
  //   role     : "creator" | "admin" | "member". Defaults to "member" so
  //              1-1 conversations and pre-existing groups work as before.
  //   nickname : optional per-member nickname. When set, the chat UI
  //              renders it instead of `users.name` for messages in that
  //              conversation. Only creator/admin can set this; members
  //              can only view it.
  role: text("role").notNull().default("member"),
  nickname: text("nickname"),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // "image" | "video" | "file"
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const readReceipts = sqliteTable("read_receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  readAt: integer("read_at", { mode: "timestamp" }).notNull(),
});

// ─── Diary encounters ───────────────────────────────────────────────────────

/**
 * One "chạm mặt bất ngờ" event between a viewer and another user.
 *
 *   viewer_id      : the user who sees the encounter
 *   encountered_id : the bumped-into user
 *   picked_at      : unix seconds when the system surfaced this pair.
 *                    Combined with viewer_id via UNIQUE so we never pick
 *                    the same (viewer, day) twice.
 *   viewed_at      : when the viewer opened the encounter card
 *   dismissed_at   : when the viewer clicked "Bỏ qua" — null = still active
 *   note           : optional free-text note the viewer added
 */
export const diaryEncounters = sqliteTable("diary_encounters", {
  id: text("id").primaryKey(),
  viewerId: text("viewer_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  encounteredId: text("encountered_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pickedAt: integer("picked_at", { mode: "timestamp" }).notNull(),
  viewedAt: integer("viewed_at", { mode: "timestamp" }),
  dismissedAt: integer("dismissed_at", { mode: "timestamp" }),
  note: text("note"),
});

export type DiaryEncounter = typeof diaryEncounters.$inferSelect;
export type NewDiaryEncounter = typeof diaryEncounters.$inferInsert;

// ─── Vault ─────────────────────────────────────────────────────────────────

/**
 * Private journal entries ("Hộp bí mật"). Each note belongs to exactly
 * one user (the author/owner).
 *
 * Visibility model:
 *   - `visibility = "private"` : owner-only (legacy behaviour). Even
 *     friends with maxed-out closeness cannot see the entry.
 *   - `visibility = "shared"`  : friends may see the note IF
 *       (a) they have enough closeness points with the author (>= unlock_points, or
 *           the global mirror_settings.video_unlock_points when NULL), AND
 *       (b) the author hasn't explicitly denied them in vault_note_visibility.
 *
 * The `vault_note_visibility` table holds two kinds of entries:
 *   - `state = "allowed"` overrides a "denied" decision made by a
 *     blanket rule, or grants access to a specific friend below the
 *     unlock threshold (friend with low closeness but special bond).
 *   - `state = "denied"`  blocks a friend who otherwise would have
 *     qualified under the unlock threshold.
 */
export const vaultNotes = sqliteTable("vault_notes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mood: text("mood").notNull().default("neutral"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // Per-note unlock threshold. NULL means "use the global default
  // (mirror_settings.video_unlock_points)". Owners set this from the
  // Vault UI ("Điểm thân thiết yêu cầu").
  unlockPoints: integer("unlock_points"),
  // "private" or "shared" — see comment above.
  visibility: text("visibility").notNull().default("shared"),
});

/**
 * Per-note allow/deny overrides. Absence of a row means "no override":
 * the viewer is governed by the global unlock-points check. A row with
 * state="denied" wins over the points check; state="allowed" wins over
 * a denial-by-points (so owners can grant access to low-closeness
 * friends they trust).
 */
export const vaultNoteVisibility = sqliteTable("vault_note_visibility", {
  id: text("id").primaryKey(),
  noteId: text("note_id")
    .notNull()
    .references(() => vaultNotes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // "allowed" | "denied"
  state: text("state").notNull().default("allowed"),
  // Optional comma-separated list of moods the override applies to.
  // NULL means "all moods". Owners can use this to say "hide my sad
  // notes from @alice but still let her see the happy ones".
  moodFilter: text("mood_filter"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type VaultNote = typeof vaultNotes.$inferSelect;
export type NewVaultNote = typeof vaultNotes.$inferInsert;
export type VaultNoteVisibility = typeof vaultNoteVisibility.$inferSelect;
export type NewVaultNoteVisibility = typeof vaultNoteVisibility.$inferInsert;

// ─── Posts ───────────────────────────────────────────────────────────────────

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  caption: text("caption").notNull().default(""),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").notNull(),
  publicId: text("public_id"),
  lens: text("lens").notNull().default("friends"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // AI moderation fields
  moderationStatus: text("moderation_status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  moderationReason: text("moderation_reason"),
  moderationScore: integer("moderation_score").default(100),
  moderatedAt: integer("moderated_at", { mode: "timestamp" }),
  mediaWidth: integer("media_width"),
  mediaHeight: integer("media_height"),
});

export type User = typeof users.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type Post = typeof posts.$inferSelect;

// ─── Notifications ────────────────────────────────────────────────────────

/**
 * Notifications are emitted for many user-visible events:
 *   - friend_request: someone sent you a friend request
 *   - friend_accept : someone accepted your friend request
 *   - like          : someone liked your post
 *   - comment       : someone commented on your post
 *   - share         : someone shared your post to a friend/group
 *   - follow        : someone started following you (one-way)
 *   - mention       : you were @mentioned somewhere
 *   - group_invite  : you were invited to a group
 *
 * The `data` JSON column holds extra context (e.g. `{ postId }`,
 * `{ requestId }`) so the client can route the user to the right place
 * without hard-coding switch statements on `type`.
 */
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  // Who this notification is for (the actor sees the message).
  recipientId: text("recipient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Who triggered the notification (null when the system itself is the actor,
  // e.g. "Your post was approved").
  actorId: text("actor_id").references(() => users.id, { onDelete: "cascade" }),
  // Discriminator — see enum above.
  type: text("type").notNull(),
  // Pre-formatted human text. Stored so the client doesn't need a lookup
  // table to render a notification.
  title: text("title").notNull(),
  body: text("body"),
  // JSON blob of additional context.
  data: text("data"),
  // Read state — the bug that broke updates: we kept this as text in some
  // routes. Always treat `read` as integer (0/1) — never null.
  read: integer("read").notNull().default(0),
  readAt: integer("read_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ─── Closeness / Streak / Mirror settings ────────────────────────────────────

/**
 * Cached aggregate "closeness" score for a friendship pair. Updated whenever
 * either side likes or comments on a post that the other side can see.
 *
 *   points         : activity-ratio score in [0, imageFullPoints]
 *   streak_days    : longest reciprocal-interaction streak ending in the
 *                    last 24 hours
 *   last_activity  : unix seconds of the most recent interaction either side
 *   updated_at     : unix seconds of the last recompute (for cache TTL)
 *
 * The pair is canonicalised so (a,b) and (b,a) collide on the same row.
 */
export const closeness = sqliteTable("closeness", {
  pairKey: text("pair_key").primaryKey(),
  points: integer("points").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  lastActivity: integer("last_activity").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

/**
 * Configurable thresholds for the "Gương vô hình" feature. Stored in a
 * singleton row keyed by `id = 'global'` so admins can tweak them at
 * runtime without a redeploy.
 */
export const mirrorSettings = sqliteTable("mirror_settings", {
  id: text("id").primaryKey(),
  imageFullPoints: integer("image_full_points").notNull().default(100),
  videoUnlockPoints: integer("video_unlock_points").notNull().default(60),
  activityCap: integer("activity_cap").notNull().default(95),
  streakBonusMax: integer("streak_bonus_max").notNull().default(5),
  activityWindowDays: integer("activity_window_days").notNull().default(14),
  updatedAt: integer("updated_at").notNull().default(0),
});

export type ClosenessRow = typeof closeness.$inferSelect;
export type MirrorSettingsRow = typeof mirrorSettings.$inferSelect;

// ─── Groups (Phase 1 schema; Phase 2 will rewire UI to read from here) ────

/**
 * First-class group entity. Replaces the legacy "Hội bạn thân" model
 * that was based on `friendships`. Phase 2 will redirect `/api/groups/*`
 * to read from this table so visibility is scoped to explicit
 * membership instead of friendship edges.
 *
 * Visibility:
 *   - "public"  : discoverable on the discover page; anyone may join.
 *   - "private" : hidden from discovery; only existing members see it.
 *
 * The creator of a group is also recorded as a group_members row with
 * role='creator' so the same permissions code path covers them.
 */
export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  description: text("description"),
  visibility: text("visibility").notNull().default("private"),
  creatorId: text("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const groupMembers = sqliteTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // "creator" | "admin" | "member"
  joinedAt: integer("joined_at").notNull().default(0),
});

/**
 * Many-to-many join between posts and groups. A post with no rows here
 * is a personal post (visible only to its author in Phase 2's UI). A
 * post with one or more rows is shared into those groups' feeds.
 */
export const groupPosts = sqliteTable("group_posts", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  postedAt: integer("posted_at").notNull().default(0),
});

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupPost = typeof groupPosts.$inferSelect;
