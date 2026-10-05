-- Encounter diary — tracks "chạm mặt bất ngờ" moments.
-- Each row records one encounter between the viewer and another user
-- (the "bumped-into" user). An encounter is picked by the system
-- (POST /api/diary/encounters/pick) and can be dismissed by the viewer.
CREATE TABLE IF NOT EXISTS diary_encounters (
  id              TEXT PRIMARY KEY,
  viewer_id       TEXT NOT NULL,
  encountered_id  TEXT NOT NULL,
  picked_at       INTEGER NOT NULL,   -- unix seconds when the pick happened
  viewed_at       INTEGER,            -- NULL = not opened yet
  dismissed_at    INTEGER,            -- NULL = still active
  note            TEXT,               -- optional viewer note ("gặp ở quán cà phê")
  UNIQUE(viewer_id, picked_at)
);

CREATE INDEX IF NOT EXISTS idx_diary_encounters_viewer_picked
  ON diary_encounters(viewer_id, picked_at DESC);
