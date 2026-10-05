-- Migration: Add phone, provider, and google_id columns to users table
-- Date: 2026-08-30

-- Make email nullable (for phone-only accounts)
ALTER TABLE users RENAME COLUMN email TO email_old;
ALTER TABLE users ADD COLUMN email TEXT;

-- Copy data from old column
UPDATE users SET email = email_old;

-- Make password nullable (for Google/phone accounts)
ALTER TABLE users RENAME COLUMN password TO password_old;
ALTER TABLE users ADD COLUMN password TEXT;

-- Copy data from old column
UPDATE users SET password = password_old;

-- Add provider column
ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'credentials';

-- Add google_id column
ALTER TABLE users ADD COLUMN google_id TEXT;

-- Drop old columns
ALTER TABLE users DROP COLUMN email_old;
ALTER TABLE users DROP COLUMN password_old;

-- Create phone_otps table for OTP verification
CREATE TABLE IF NOT EXISTS phone_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  otp TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON phone_otps(phone);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
