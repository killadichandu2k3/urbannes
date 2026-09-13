import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith, filter } from 'rxjs/operators';
import { GraphqlService } from '../core/services/graphql.service';
import { AuthService } from '../core/services/auth.service';
import { AppNotification } from '../core/models';

@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.component.html',
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  open = false;
  private pollSub: Subscription | null = null;

  constructor(private readonly graphql: GraphqlService, public readonly auth: AuthService) {}

  get unreadCount(): number {
    return this.notifications.filter((n) => !n.readAt).length;
  }

  ngOnInit(): void {
    // Simple poll rather than a new GraphQL subscription — notifications
    // are already pushed in real time to email/in-app via Kafka on the
    // backend (see notification-service), but wiring a THIRD live
    // transport (on top of the existing bookingUpdated/seatMapUpdated
    // subscriptions) for a dropdown that's opened occasionally isn't worth
    // the added connection; a 20s poll while logged in is enough for a
    // bell icon's actual use pattern.
    //
    // Gated on isLoggedIn: the template already hides this component
    // entirely for signed-out visitors (see notification-bell.component.html),
    // but with a public landing page now in the route tree, a signed-out
    // poll would otherwise still fire in the background and hit
    // myNotifications' auth check every 20s for no reason — this guard
    // stops that at the source instead of relying only on the template.
    this.pollSub = interval(20_000)
      .pipe(
        startWith(0),
        filter(() => this.auth.isLoggedIn),
        switchMap(() => this.graphql.myNotifications()),
      )
      .subscribe({
        next: (list) => (this.notifications = list),
        error: () => {
          /* silent — a failed poll just leaves the last-known list showing */
        },
      });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  toggle(): void {
    this.open = !this.open;
  }

  markRead(n: AppNotification): void {
    if (n.readAt) return;
    this.graphql.markNotificationRead(n.id).subscribe(() => {
      n.readAt = new Date().toISOString();
    });
  }

  markAllRead(): void {
    if (this.unreadCount === 0) return;
    this.graphql.markAllNotificationsRead().subscribe(() => {
      const now = new Date().toISOString();
      this.notifications = this.notifications.map((n) => ({ ...n, readAt: n.readAt ?? now }));
    });
  }
}
