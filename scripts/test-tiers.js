require('dotenv').config({ path: '.env.local' });
const { encode } = require('next-auth/jwt');

(async () => {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev-secret-do-not-use-in-prod';
  console.log('secret length:', secret.length);
  const t = await encode({
    token: {
      id: 'c_mtcjw367nqy3psn5ey',
      email: 'huuphucdepzaihg@gmail.com',
      username: 'phucnguyen',
      name: 'Ping',
    },
    secret,
  });
  console.log('token len:', t.length);

  const r = await fetch('http://localhost:3000/api/groups/tiers', {
    headers: { Authorization: 'Bearer ' + t },
  });
  console.log('status:', r.status);
  const data = await r.json();
  console.log('data keys:', Object.keys(data));
  if (data.recent) {
    console.log('recent:');
    for (const item of data.recent) {
      console.log('  -', item.lens, '|', item.id.slice(0,12), '| pointsToUnlock:', item.pointsToUnlock, '| effectiveUnlock:', item.effectiveUnlock, '| url:', item.mediaUrl.slice(0, 50));
    }
  } else {
    console.log(JSON.stringify(data).slice(0, 300));
  }
})().catch(e => console.error('err:', e.message));