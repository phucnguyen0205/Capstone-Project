// Cleanup script: remove mockup posts (URLs pointing to example.com or
// other placeholder hosts) from the posts table. These were inserted by
// older seed scripts and only show up as broken images in the gallery.
//
// Run: node scripts/clean-mockup-posts.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pulo.db'), {
  // We're about to delete rows; force RW.
  fileMustExist: true,
});

const PLACEHOLDER_HOSTS = [
  'example.com',
  'placeholder.com',
  'via.placeholder.com',
];

const placeholders = PLACEHOLDER_HOSTS.map(() => 'media_url LIKE ?').join(' OR ');
const before = db
  .prepare(`SELECT id, user_id, lens, media_url, caption FROM posts WHERE ${placeholders}`)
  .all(...PLACEHOLDER_HOSTS.map((h) => `%${h}%`));

console.log('Mockup posts found:', before.length);
for (const r of before) {
  console.log('  -', r.id, '|', r.lens, '|', r.user_id.slice(0, 12), '|', r.media_url);
  if (r.caption) console.log('       caption:', r.caption);
}

if (before.length === 0) {
  console.log('Nothing to clean.');
  db.close();
  process.exit(0);
}

const ids = before.map((r) => r.id);
const placeholdersIn = ids.map(() => '?').join(',');
const tx = db.transaction((idList) => {
  for (const id of idList) {
    db.prepare('DELETE FROM likes WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM saves WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM post_hides WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  }
});
tx(ids);

const remaining = db
  .prepare(`SELECT COUNT(*) as c FROM posts WHERE ${placeholders}`)
  .get(...PLACEHOLDER_HOSTS.map((h) => `%${h}%`));

console.log('Deleted:', ids.length, 'rows.');
console.log('Remaining mockup posts:', remaining.c);
db.close();
