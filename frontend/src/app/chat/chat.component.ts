import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChatService } from '../core/services/chat.service';
import { AuthService } from '../core/services/auth.service';
import { ChatMessage } from '../core/models';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('logEl') logEl?: ElementRef<HTMLDivElement>;

  connected = false;
  currentRoom = '';
  roomIdInput = 'event-lobby';
  participantCount = 0;
  messages: ChatMessage[] = [];
  draft = '';

  private shouldScroll = false;
  private subs: Subscription[] = [];
  // ChatComponent is only reachable behind AuthGuard (see
  // app-routing.module.ts), so auth.currentUser is guaranteed non-null here.
  // chat-service itself is plain WebSocket, not GraphQL (see
  // ChatService's header comment) — it doesn't verify the JWT the way
  // booking-api's resolvers do, it just needs an id string for
  // join/leave/message attribution. Using the real authenticated user's id
  // (instead of the old SessionService's random anonymous one) at least
  // means chat messages are attributed to the same identity as bookings.
  private get userId(): string {
    return this.auth.currentUser!.id;
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly chat: ChatService,
    public readonly auth: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    const routeRoomId = this.route.snapshot.paramMap.get('roomId');
    if (routeRoomId) this.roomIdInput = routeRoomId;

    this.subs.push(
      this.chat.history$.subscribe(({ roomId, messages }) => {
        if (roomId === this.currentRoom) {
          this.messages = messages;
          this.shouldScroll = true;
        }
      }),
      this.chat.message$.subscribe((message) => {
        if (message.roomId === this.currentRoom) {
          this.messages.push(message);
          this.shouldScroll = true;
        }
      }),
      this.chat.presence$.subscribe(({ roomId, participantCount }) => {
        if (roomId === this.currentRoom) this.participantCount = participantCount;
      }),
    );

    await this.chat.connect();
    this.connected = true;
    this.joinRoom();
  }

  ngAfterViewChecked(): void {
    // Angular's equivalent of the Vue version's nextTick()-based
    // scrollToBottom(): AfterViewChecked runs after every change-detection
    // pass that could have touched the DOM, so checking a flag here and
    // scrolling then is the idiomatic way to react to "the log just grew"
    // without manually wiring a MutationObserver.
    if (this.shouldScroll && this.logEl) {
      this.logEl.nativeElement.scrollTop = this.logEl.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  ngOnDestroy(): void {
    if (this.currentRoom) this.chat.leave(this.currentRoom, this.userId);
    this.chat.disconnect();
    this.subs.forEach((s) => s.unsubscribe());
  }

  joinRoom(): void {
    if (this.currentRoom) this.chat.leave(this.currentRoom, this.userId);
    this.messages = [];
    this.currentRoom = this.roomIdInput;
    this.chat.join(this.currentRoom, this.userId);
  }

  send(): void {
    if (!this.draft.trim() || !this.currentRoom) return;
    this.chat.sendMessage(this.currentRoom, this.userId, this.draft.trim());
    this.draft = '';
  }
}
