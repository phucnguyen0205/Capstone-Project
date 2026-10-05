-- Add per-note visibility controls so owners can decide which friends
-- may see each vault entry, and which friendship-closeness threshold
-- unlocks the entry.

-- unlock_points: minimum closeness points (between viewer and author)
--   required to read this note. NULL means "not yet configured" —
--   treated as the global mirror_settings.video_unlock_points default.
ALTER TABLE vault_notes
  ADD COLUMN unlock_points INTEGER;

-- visibility: "private" keeps the legacy behaviour (owner only). The
--   new default is "shared" so existing rows pick up the new feature.
ALTER TABLE vault_notes
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'shared';

-- Index so the shared-feed endpoint can scan only unlocked rows by
-- recency without touching notes the viewer can't reach.
CREATE INDEX IF NOT EXISTS idx_vault_notes_visibility_created
  ON vault_notes(visibility, created_at DESC);

-- Per-note allow/deny list. The owner sets this from inside the Vault
-- UI ("Người được thấy" / "Người bị ẩn"). Empty allow-list + no
-- denials = visible to every friend whose closeness >= unlock_points.
CREATE TABLE IF NOT EXISTS vault_note_visibility (
  id           TEXT PRIMARY KEY,
  note_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'allowed', -- 'allowed' | 'denied'
  created_at   INTEGER NOT NULL,
  UNIQUE(note_id, user_id),
  FOREIGN KEY (note_id) REFERENCES vault_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_note_visibility_note
  ON vault_note_visibility(note_id);

CREATE INDEX IF NOT EXISTS idx_vault_note_visibility_user
  ON vault_note_visibility(user_id);
