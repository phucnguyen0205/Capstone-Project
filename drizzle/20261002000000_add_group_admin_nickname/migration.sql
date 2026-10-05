-- Migration: Add admin role + per-member nickname to group chats
--
-- Adds two columns to conversation_participants:
--   role     : 'creator' | 'admin' | 'member' (defaults to 'member')
--   nickname : optional display name set by an admin/creator. When set,
--              the chat UI renders this name instead of users.name
--              wherever this conversation is rendered.
--
-- Existing rows default to role='member' and nickname=NULL so the
-- chat keeps working unchanged for users that never had a nickname.

ALTER TABLE conversation_participants ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE conversation_participants ADD COLUMN nickname TEXT;

-- Backfill: the conversation's creator. We can't infer who created a
-- conversation from schema (no created_by column exists), so we fall
-- back to the participant with the lowest participant.id in each
-- group conversation. cuid ids embed a monotonic timestamp so "MIN(id)"
-- approximates "inserted first" — matches the prior implicit invariant
-- that whoever inserted first "owns" the group.
--
-- Note: existing data has many groups with all participants sharing
-- the same joined_at timestamp (the old group-creation code inserted
-- every participant in the same transaction). Using joined_at alone
-- would mark every member as creator, so we use participant.id instead.
UPDATE conversation_participants
SET role = 'creator'
WHERE id IN (
  SELECT cp.id FROM conversation_participants cp
  JOIN conversations c ON c.id = cp.conversation_id
  WHERE c.is_group = 1
    AND cp.role = 'member'
    AND cp.id = (
      SELECT MIN(cp2.id) FROM conversation_participants cp2
      WHERE cp2.conversation_id = cp.conversation_id
    )
);