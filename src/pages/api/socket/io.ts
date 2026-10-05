import { Server as NetServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { initializeCallSocket } from '@/lib/socket';

export const config = {
  api: {
    bodyParser: false,
  },
};

type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: NetServer & {
      io?: SocketIOServer;
    };
  };
};

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
  if (res.socket.server.io) {
    console.log('[Socket.IO] Already initialized');
    res.end();
    return;
  }

  console.log('[Socket.IO] Initializing...');
  const io = new SocketIOServer(res.socket.server, {
    path: '/api/socket/io',
    addTrailingSlash: false,
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:8080'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  res.socket.server.io = io;

  // Initialize call signaling
  initializeCallSocket(io);

  console.log('[Socket.IO] Initialized successfully');
  res.end();
}
