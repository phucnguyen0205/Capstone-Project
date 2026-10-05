-- Migration: Add notifications table for the global notification system
-- Stores every user-visible event (friend_request, friend_accept, like,
-- comment, share, follow, mention, group_invite, system, ...).
--
-- Read state is stored as integer (0 = unread, 1 = read). We keep it
-- NOT NULL with default 0 — the legacy bug was that the UPDATE handler
-- compared a string "true"/"false" against an integer column, which
-- silently failed to flip the bit.

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  recipient_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  data          TEXT,
  read          INTEGER NOT NULL DEFAULT 0,
  read_at       INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_id, read, created_at DESC);
