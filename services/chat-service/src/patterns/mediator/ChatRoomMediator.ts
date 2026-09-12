// ============================================================================
// PATTERN: MEDIATOR — a ChatRoom is the mediator between its connected
// participants. Participants never talk to each other directly (no
// participant holds a reference to another participant's socket); they
// only talk to the room, and the room decides how to fan a message out.
// This keeps adding new room-level behavior (e.g. muting, read receipts,
// participant limits) in one place instead of scattered across every
// client connection handler.
// ============================================================================

export interface ChatParticipant {
  readonly userId: string;
  send(payload: unknown): void;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  body: string;
  sentAt: string;
}

export interface ChatMediator {
  join(roomId: string, participant: ChatParticipant): void;
  leave(roomId: string, userId: string): void;
  broadcast(roomId: string, message: ChatMessage): void;
  participantCount(roomId: string): number;
}

export class ChatRoomMediator implements ChatMediator {
  // roomId -> userId -> participant
  private rooms = new Map<string, Map<string, ChatParticipant>>();

  join(roomId: string, participant: ChatParticipant): void {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    room.set(participant.userId, participant);
  }

  leave(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.delete(userId);
    if (room.size === 0) this.rooms.delete(roomId);
  }

  broadcast(roomId: string, message: ChatMessage): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const participant of room.values()) {
      participant.send(message);
    }
  }

  participantCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }
}

export const chatRoomMediator = new ChatRoomMediator();
