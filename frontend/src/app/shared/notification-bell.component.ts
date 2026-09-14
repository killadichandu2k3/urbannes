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

    this.pollSub = interval(5_000)
      .pipe(
        startWith(0),
        filter(() => this.auth.isLoggedIn),
        switchMap(() => this.graphql.myNotifications()),
      )
      .subscribe({
        next: (list) => (this.notifications = list),
        error: () => {

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

  deleteNotification(id: string): void {
    this.graphql.deleteNotification(id).subscribe(() => {
      this.notifications = this.notifications.filter((n) => n.id !== id);
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
