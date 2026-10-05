const http = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

// Use dynamic import for TypeScript module
let initializeCallSocket;

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Next.js 14+ requires dir argument
const app = next({ dev, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Import TypeScript module dynamically (Node.js will use ts-node or Next.js loader)
  const socketModule = await import('./src/lib/socket.ts');
  initializeCallSocket = socketModule.initializeCallSocket;

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO
  const io = new Server(server, {
    path: '/api/socket/io',
    cors: {
      origin: dev ? ['http://localhost:3000', 'http://localhost:8080'] : [],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Initialize call signaling
  initializeCallSocket(io);

  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket enabled at ws://${hostname}:${port}/api/socket/io`);
  });
});
