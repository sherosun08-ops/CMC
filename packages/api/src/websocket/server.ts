// WebSocket server — real-time events for content, orders, notifications

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '@cmc/auth';

let io: Server | null = null;

export function createWebSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token as string);
      (socket as any).userId = payload.sub;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`WebSocket connected: user ${userId}`);

    // Join user room
    socket.join(`user:${userId}`);

    // Join admin room if super admin
    if ((socket as any).user?.isSuperAdmin) {
      socket.join('admin');
    }

    // Content change events
    socket.on('subscribe:content', (contentTypeId: string) => {
      socket.join(`content:${contentTypeId}`);
    });

    socket.on('unsubscribe:content', (contentTypeId: string) => {
      socket.leave(`content:${contentTypeId}`);
    });

    // Order events
    socket.on('subscribe:orders', () => {
      socket.join('orders');
    });

    // Typing indicator (content editor)
    socket.on('content:typing', (data: { contentTypeId: string; itemId: string }) => {
      socket.to(`content:${data.itemId}`).emit('content:typing', {
        userId,
        itemId: data.itemId,
      });
    });

    socket.on('disconnect', () => {
      console.log(`WebSocket disconnected: user ${userId}`);
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

// Emit events from any module
export function emitEvent(channel: string, event: string, data: unknown): void {
  if (io) {
    io.to(channel).emit(event, data);
  }
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

export function emitToAll(event: string, data: unknown): void {
  if (io) {
    io.emit(event, data);
  }
}