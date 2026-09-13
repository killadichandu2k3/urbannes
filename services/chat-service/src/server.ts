// ============================================================================
// chat-service SERVER — plain `ws` WebSocket server (no GraphQL here; chat
// is the "raw WebSocket" example in the platform, deliberately different
// transport from booking-api's graphql-ws subscriptions, so both styles are
// represented).
// ----------------------------------------------------------------------------
// Protocol (JSON frames over the socket):
//   Client -> Server: { type: 'JOIN', roomId, userId }
//   Client -> Server: { type: 'MESSAGE', roomId, userId, body }
//   Client -> Server: { type: 'LEAVE', roomId, userId }
//   Server -> Client: { type: 'HISTORY', roomId, messages: ChatMessage[] }
//   Server -> Client: { type: 'MESSAGE', ...ChatMessage }
//   Server -> Client: { type: 'PRESENCE', roomId, participantCount }
// ============================================================================

import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@urbannes/shared';
import { chatRoomMediator, ChatMessage, ChatParticipant } from './patterns/mediator/ChatRoomMediator';
import { startFanOutBridge, publishToAllPods } from './redis/fanOutBridge';
import { appendToHistory, getHistory } from './redis/chatHistory';

const logger = createLogger('chat-service');
const PORT = Number(process.env.PORT || 4200);

interface JoinFrame { type: 'JOIN'; roomId: string; userId: string }
interface MessageFrame { type: 'MESSAGE'; roomId: string; userId: string; body: string }
interface LeaveFrame { type: 'LEAVE'; roomId: string; userId: string }
type ClientFrame = JoinFrame | MessageFrame | LeaveFrame;

async function main() {
  await startFanOutBridge();

  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'chat-service' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/chat' });

  wss.on('connection', (socket: WebSocket) => {
    const joinedRooms = new Set<string>();
    let currentUserId: string | null = null;

    const participant: ChatParticipant = {
      get userId() {
        return currentUserId ?? 'unknown';
      },
      send(payload: unknown) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
      },
    };

    socket.on('message', async (raw) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (frame.type === 'JOIN') {
        currentUserId = frame.userId;
        chatRoomMediator.join(frame.roomId, participant);
        joinedRooms.add(frame.roomId);
        const history = await getHistory(frame.roomId);
        participant.send({ type: 'HISTORY', roomId: frame.roomId, messages: history });
        participant.send({ type: 'PRESENCE', roomId: frame.roomId, participantCount: chatRoomMediator.participantCount(frame.roomId) });
        logger.info('User joined room', { roomId: frame.roomId, userId: frame.userId });
      } else if (frame.type === 'MESSAGE') {
        const message: ChatMessage = {
          id: uuidv4(),
          roomId: frame.roomId,
          userId: frame.userId,
          body: frame.body,
          sentAt: new Date().toISOString(),
        };
        await appendToHistory(message);
        // Publish to ALL pods (including this one) rather than calling
        // chatRoomMediator.broadcast() directly here — this keeps exactly
        // one delivery path (via Redis) regardless of whether the sender
        // and recipient happen to share a pod, avoiding subtle double-send
        // or missed-send bugs from having two different code paths.
        await publishToAllPods(message);
      } else if (frame.type === 'LEAVE') {
        chatRoomMediator.leave(frame.roomId, frame.userId);
        joinedRooms.delete(frame.roomId);
      }
    });

    socket.on('close', () => {
      if (currentUserId) {
        for (const roomId of joinedRooms) chatRoomMediator.leave(roomId, currentUserId);
      }
    });
  });

  httpServer.listen(PORT, () => {
    logger.info(`chat-service ready`, { wsUrl: `ws://localhost:${PORT}/chat` });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
