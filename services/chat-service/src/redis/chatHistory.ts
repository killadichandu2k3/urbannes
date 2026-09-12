// ============================================================================
// CHAT HISTORY — a capped Redis LIST per room (LPUSH + LTRIM), so a client
// joining a room can fetch recent history without standing up a full
// database table for what is, by nature, ephemeral/recent-focused data.
// Capped at 100 messages per room to bound memory use.
// ============================================================================

import Redis from 'ioredis';
import { ChatMessage } from '../patterns/mediator/ChatRoomMediator';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
});

const HISTORY_CAP = 100;

function historyKey(roomId: string): string {
  return `chat:history:${roomId}`;
}

export async function appendToHistory(message: ChatMessage): Promise<void> {
  const key = historyKey(message.roomId);
  await redis.lpush(key, JSON.stringify(message));
  await redis.ltrim(key, 0, HISTORY_CAP - 1);
}

export async function getHistory(roomId: string, limit = 50): Promise<ChatMessage[]> {
  const raw = await redis.lrange(historyKey(roomId), 0, limit - 1);
  return raw.map((r) => JSON.parse(r) as ChatMessage).reverse(); // oldest-first for display
}
