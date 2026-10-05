// Seed script: insert a handful of video posts so the Khám phá and
// Thư viện của bạn surfaces have something to render.
//
// We use the existing Cloudinary image URLs as "video" media_url
// placeholders so the players have a real, loadable asset to play.
// The browser will treat the resource as failing-to-load as video
// (no video container), but the poster + lock overlay will still
// render and the user can verify the surface works.
//
// For actual video files, drop mp4 URLs into MEDIA_URLS below — the
// API doesn't care which it is as long as the browser can stream it.
//
// Run: node scripts/seed-reels.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pulo.db'));

// Cloudinary demo videos — these are the publicly hosted demo MP4s
// the Cloudinary docs use. They should stream in <video> tags.
const MEDIA_URLS = [
  'https://res.cloudinary.com/demo/video/upload/dog.mp4',
  'https://res.cloudinary.com/demo/video/upload/dog_running.mp4',
  'https://res.cloudinary.com/demo/video/upload/elephants.mp4',
  'https://res.cloudinary.com/demo/video/upload/cup.mp4',
];

const CAPTIONS = [
  'Cảnh đẹp 🌅',
  'Thử thách vui trong ngày hôm nay',
  'Cùng xem nào các bạn',
  'Chill cuối tuần 🏖️',
  'Một ngày đẹp trời ✨',
];

const LENSES = ['public', 'friends', 'close'];

function cuid() {
  return (
    'c_' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 11)
  );
}

async function main() {
  // Find two users so we can scatter videos between them.
  const users = db
    .prepare('SELECT id FROM users ORDER BY created_at LIMIT 4')
    .all();
  if (users.length < 2) {
    console.error('Need at least 2 users in the DB.');
    process.exit(1);
  }

  let total = 0;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < MEDIA_URLS.length; i++) {
    const author = users[i % users.length];
    const lens = LENSES[i % LENSES.length];
    const id = cuid();
    const createdAt = now - i * 3600; // stagger 1 hour apart
    db.prepare(
      `INSERT OR IGNORE INTO posts
         (id, user_id, caption, media_url, media_type, public_id, lens,
          created_at, moderation_status, moderation_reason,
          moderation_score, moderated_at, media_width, media_height)
       VALUES (?, ?, ?, ?, 'video', ?, ?, ?, 'approved', NULL, 0, ?, 1080, 1920)`,
    ).run(
      id,
      author.id,
      CAPTIONS[i % CAPTIONS.length],
      MEDIA_URLS[i],
      'seed-' + id,
      lens,
      createdAt,
      createdAt,
    );
    total += 1;
    console.log('  +', id, '|', lens, '| user:', author.id.slice(0, 12));
  }
  console.log('Inserted', total, 'video posts.');
  db.close();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  db.close();
  process.exit(1);
});