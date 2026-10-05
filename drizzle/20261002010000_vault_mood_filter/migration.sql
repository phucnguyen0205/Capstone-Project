-- Add per-mood filtering to per-note visibility overrides. When NULL,
-- the override applies to all moods on that note. When set, it's a
-- comma-separated list of moods (e.g. 'sad,angry') that the entry
-- applies to. This lets owners say "hide my sad notes from @alice but
-- let her still see the happy ones".
ALTER TABLE vault_note_visibility
  ADD COLUMN mood_filter TEXT;