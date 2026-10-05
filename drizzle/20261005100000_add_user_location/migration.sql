-- Migration: Add location fields to users for the Discover page's
-- "nearby" filter and city-based ranking.
--
-- city:        free-text city the user types in (e.g. "Hà Nội",
--              "TP Hồ Chí Minh"). Nullable because not everyone fills
--              it in.
-- country:     free-text country (e.g. "Việt Nam"). Nullable.
-- latitude:    optional decimal latitude (city centre / user's
--             neighbourhood). Stored as REAL so we can use
--             trigonometry without re-parsing strings.
-- longitude:   optional decimal longitude.
--
-- Index on (country, city) to make "people in Hanoi" queries
-- fast without scanning the whole table.
ALTER TABLE users ADD COLUMN city TEXT;
ALTER TABLE users ADD COLUMN country TEXT;
ALTER TABLE users ADD COLUMN latitude REAL;
ALTER TABLE users ADD COLUMN longitude REAL;

-- Composite index for the "nearby / same city" filter used by the
-- Discover page. Two columns because the most common filter is
-- "people in my country and city".
CREATE INDEX IF NOT EXISTS idx_users_country_city ON users(country, city);