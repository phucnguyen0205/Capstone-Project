-- Migration: Link group chats (conversations where is_group=1) to the
-- first-class `groups` table so the Groups page and the chat box stay
-- in sync. When a row in `groups` is created, we want a matching
-- `conversations` row to exist; when members join/leave a group, the
-- corresponding conversation participants should reflect that.
--
-- Nullable because 1-1 conversations don't have a group, and legacy
-- group chats (created before this migration) may be orphaned.
ALTER TABLE conversations ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL;

-- Index for the chat box query that filters
-- `is_group=1 AND group_id IN (...groups I'm in...)`.
CREATE INDEX IF NOT EXISTS idx_conversations_group_id ON conversations(group_id);