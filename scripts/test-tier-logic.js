const Database = require('better-sqlite3');
const db = new Database('./pulo.db', { readonly: true });

const me = db.prepare("SELECT id FROM users WHERE username = 'phucnguyen'").get();
const mirrorCfg = db.prepare("SELECT video_unlock_points as v FROM mirror_settings WHERE id = 'global'").get();
console.log('me:', me.id, 'videoUnlock:', mirrorCfg.v);

const recent = db.prepare(`
  SELECT id, media_url, media_type, lens, user_id, created_at
  FROM posts
  WHERE (media_type = 'image' OR media_type = 'video')
    AND (user_id = ?
      OR EXISTS (
          SELECT 1 FROM friendships f
          WHERE f.status = 'accepted'
            AND ((f.requester_id = ? AND f.receiver_id = user_id)
              OR (f.requester_id = user_id AND f.receiver_id = ?))
        ))
    AND (user_id = ? OR lens != 'private')
  ORDER BY created_at DESC
  LIMIT 8
`).all(me.id, me.id, me.id, me.id);

const getCloseness = (author) => {
  const pk = me.id < author ? me.id + '|' + author : author + '|' + me.id;
  const r = db.prepare('SELECT points FROM closeness WHERE pair_key = ?').get(pk);
  return r?.points ?? 0;
};

console.log('\nResult:');
for (const p of recent) {
  let ptsToUnlock = 0;
  let effUnlock = 0;
  if (p.lens === 'close') {
    const isFriend = !!db.prepare(`
      SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND ((requester_id = ? AND receiver_id = ?)
          OR (requester_id = ? AND receiver_id = ?))
    `).get(me.id, p.user_id, p.user_id, me.id);
    if (isFriend) {
      effUnlock = mirrorCfg.v;
      const pts = getCloseness(p.user_id);
      ptsToUnlock = Math.max(0, effUnlock - pts);
    } else {
      effUnlock = mirrorCfg.v;
      ptsToUnlock = effUnlock;
    }
  }
  console.log(' -', p.lens.padEnd(8), '| author:', p.user_id.slice(0, 12), '| pointsToUnlock:', ptsToUnlock, '| effectiveUnlock:', effUnlock);
}
db.close();