-- Migration: separate "community feed" posts from "group-only" posts.
--
-- Adds `scope` column to `posts`:
--   - 'feed'  : the post lives on the public/community feed. It can be
--               ranked by the algorithm, surfaced on the discover tab,
--               and shared into one or more groups via `group_posts`
--               ONLY by an explicit follow-up POST /api/groups/[id]/posts
--               request.
--   - 'group' : the post was created directly inside a single group and
--               is scoped to that group's `group_posts` table. It never
--               appears on the community feed.
--
-- Default is 'feed' so every existing row behaves as it did before this
-- migration. The follow-up data fix-up at the bottom moves any post
-- that was attached to a group via the legacy one-step API and is NOT
-- marked 'group' yet, so the new filter is consistent.

ALTER TABLE posts ADD COLUMN scope TEXT NOT NULL DEFAULT 'feed';

-- Index for the feed route's WHERE scope='feed' filter so the planner
-- can skip posts that belong to a group.
CREATE INDEX IF NOT EXISTS posts_scope_created_at_idx
  ON posts (scope, created_at DESC);