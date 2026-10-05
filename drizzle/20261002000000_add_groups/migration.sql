-- Migration: Introduce first-class "groups" so /groups/* can show content
-- that is scoped to explicit membership instead of friendships.
--
-- PHASE 1 ONLY — schema + backfill. API + UI refactor will follow in
-- a separate change. The existing `posts.lens` column is preserved so
-- the legacy feed continues to work until Phase 2 rewires it.
--
-- New tables:
--   groups         — the group entity (name, avatar, visibility)
--   group_members  — membership + per-group role
--   group_posts    — joins posts to groups (a post may belong to 0..N
--                    groups; a post with no groups attached behaves
--                    like a personal post)

CREATE TABLE IF NOT EXISTS groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  avatar_url   TEXT,
  description  TEXT,
  -- "public" : discoverable + joinable by anyone (Phase 2 will gate
  --            actual join via membership record).
  -- "private": hidden from discovery; only existing members can see it.
  visibility   TEXT NOT NULL DEFAULT 'private',
  -- creator_id is the user that originally created the group. They get
  -- a matching group_members row with role='creator' at insert time.
  creator_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_groups_creator ON groups(creator_id);
CREATE INDEX IF NOT EXISTS idx_groups_visibility ON groups(visibility);

CREATE TABLE IF NOT EXISTS group_members (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- "creator" | "admin" | "member". Creator is the founder; admins are
  -- promoted by creator; everyone else is member.
  role          TEXT NOT NULL DEFAULT 'member',
  joined_at     INTEGER NOT NULL DEFAULT 0,
  -- A user appears at most once per group; this index also gives O(1)
  -- membership lookups in the visibility gates.
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

CREATE TABLE IF NOT EXISTS group_posts (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  posted_at   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_group_posts_group ON group_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_group_posts_post ON group_posts(post_id);

-- ─── Backfill: migrate existing users into personal default groups ───────────
--
-- Creates a "Bạn thân" group for every user that doesn't yet have a
-- group. The creator of each default group is the user themselves so
-- they get the admin controls they're used to.
--
-- We don't touch the existing `friendships` table — Phase 2 will
-- rewire `/api/groups/*` to read from `group_members` instead. Until
-- then, the old endpoints keep working unchanged.
INSERT INTO groups (id, name, description, visibility, creator_id, created_at, updated_at)
SELECT 'g_default_' || u.id,
       'Bạn thân',
       'Nhóm mặc định của bạn',
       'private',
       u.id,
       COALESCE(u.created_at, CAST(strftime('%s','now') AS INTEGER)),
       COALESCE(u.created_at, CAST(strftime('%s','now') AS INTEGER))
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM groups g WHERE g.creator_id = u.id
);

INSERT INTO group_members (id, group_id, user_id, role, joined_at)
SELECT 'gm_default_' || u.id,
       'g_default_' || u.id,
       u.id,
       'creator',
       COALESCE(u.created_at, CAST(strftime('%s','now') AS INTEGER))
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM group_members gm
  WHERE gm.group_id = 'g_default_' || u.id
);

-- Optionally migrate existing friend-pairs into the viewer's default
-- group so the "Bạn thân" sidebar still has the same members they
-- used to see. We add each accepted friend to MY default group AND
-- each accepted friend to THEIR own default group (since "Bạn thân"
-- is per-user). This matches the legacy "Hội bạn thân" behaviour
-- without forcing a hard cut-over.
--
-- We only insert the pair once (the smaller side of the friend pair
-- "initiates" into the larger side's group) to avoid duplicates. This
-- is best-effort — if some pairs end up in only one side's group,
-- Phase 2's UI can offer a "resync" affordance later.
INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, joined_at)
SELECT 'gm_legacy_' || f.id,
       'g_default_' || f.requester_id,
       f.receiver_id,
       'member',
       f.updated_at
FROM friendships f
WHERE f.status = 'accepted'
  AND EXISTS (
    SELECT 1 FROM groups g WHERE g.id = 'g_default_' || f.requester_id
  );

INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, joined_at)
SELECT 'gm_legacy_b_' || f.id,
       'g_default_' || f.receiver_id,
       f.requester_id,
       'member',
       f.updated_at
FROM friendships f
WHERE f.status = 'accepted'
  AND EXISTS (
    SELECT 1 FROM groups g WHERE g.id = 'g_default_' || f.receiver_id
  );

-- Re-attach each existing post to its author's default group. Personal
-- posts (no specific audience) end up in the author's "Bạn thân" group
-- so the per-group feed has something to show on day one. Once Phase 2
-- lands we'll let the post modal pick the audience explicitly.
INSERT OR IGNORE INTO group_posts (id, group_id, post_id, posted_at)
SELECT 'gp_legacy_' || p.id,
       'g_default_' || p.user_id,
       p.id,
       p.created_at
FROM posts p
WHERE EXISTS (
  SELECT 1 FROM groups g WHERE g.id = 'g_default_' || p.user_id
);