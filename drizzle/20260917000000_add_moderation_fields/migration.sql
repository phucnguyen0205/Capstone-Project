-- Migration: Add AI moderation fields to posts
ALTER TABLE posts ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE posts ADD COLUMN moderation_reason TEXT;
ALTER TABLE posts ADD COLUMN moderation_score INTEGER DEFAULT 100;
ALTER TABLE posts ADD COLUMN moderated_at INTEGER;
