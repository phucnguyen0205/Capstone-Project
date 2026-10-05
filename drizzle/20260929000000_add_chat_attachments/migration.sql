-- Migration: Add file attachment fields to chat messages
ALTER TABLE messages ADD COLUMN file_name TEXT;
ALTER TABLE messages ADD COLUMN file_size INTEGER;