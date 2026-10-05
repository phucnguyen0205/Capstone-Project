-- Migration: Add group chat support to conversations
ALTER TABLE conversations ADD COLUMN name TEXT;
ALTER TABLE conversations ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN avatar_url TEXT;
