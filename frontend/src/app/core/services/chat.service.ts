// ============================================================================
// Chat WebSocket service — plain `ws` protocol matching chat-service's
// frame format (see services/chat-service/src/server.ts). Deliberately
// NOT GraphQL — demonstrates a raw WebSocket integration alongside the
// graphql-ws one used for booking subscriptions. Angular port of
// chatClient.ts: the original used a callback-based `.on({ onHistory,
// onMessage, onPresence })` API; this version exposes the same three
// event streams as RxJS Subjects, which is the more idiomatic Angular
// shape for a component to `.subscribe()` to in ngOnInit.
// ============================================================================

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ChatMessage } from '../models';

interface PresenceEvent {
  roomId: string;
  participantCount: number;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private socket: WebSocket | null = null;

  readonly history$ = new Subject<{ roomId: string; messages: ChatMessage[] }>();
  readonly message$ = new Subject<ChatMessage>();
  readonly presence$ = new Subject<PresenceEvent>();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.socket = new WebSocket(`${protocol}//${window.location.host}/chat`);
      this.socket.onopen = () => resolve();
      this.socket.onerror = (err) => reject(err);
      this.socket.onmessage = (evt) => {
        const frame = JSON.parse(evt.data);
        if (frame.type === 'HISTORY') this.history$.next({ roomId: frame.roomId, messages: frame.messages });
        else if (frame.type === 'MESSAGE') this.message$.next(frame);
        else if (frame.type === 'PRESENCE') this.presence$.next({ roomId: frame.roomId, participantCount: frame.participantCount });
      };
    });
  }

  join(roomId: string, userId: string): void {
    this.send({ type: 'JOIN', roomId, userId });
  }

  sendMessage(roomId: string, userId: string, body: string): void {
    this.send({ type: 'MESSAGE', roomId, userId, body });
  }

  leave(roomId: string, userId: string): void {
    this.send({ type: 'LEAVE', roomId, userId });
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }
}
