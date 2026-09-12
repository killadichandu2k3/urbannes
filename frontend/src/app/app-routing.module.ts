import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

// Lazy-loaded feature modules — the NgModule-era equivalent of code
// splitting per route. The original Vue app imported every view eagerly
// in router/index.ts; loadChildren here is the more idiomatic Angular
// pattern for the same four-route shape, and ships less JS on first load.
//
// The optional `:roomId?` param from the original Vue route
// (`/chat/:roomId?`) has no direct Angular equivalent — Angular's router
// doesn't support optional path segments the same way. Two route entries
// covering both cases (with and without the param) achieves the same
// behavior; ChatComponent already treats the param as possibly absent.
//
// /auth/login and /auth/register are the only routes WITHOUT
// canActivate: [AuthGuard] — everything else now requires a signed-in
// user, replacing the old "anyone gets a random anonymous id" model (see
// the removed SessionService and AuthService's header comment).
const routes: Routes = [
  // Single top-level path prefix, loaded once — AuthModule's own routes
  // (see auth.module.ts) supply 'login' and 'register' underneath it.
  { path: 'auth', loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule) },
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: '', loadChildren: () => import('./events/events.module').then((m) => m.EventsModule) },
      {
        path: 'events/:eventId/seats',
        loadChildren: () => import('./seat-map/seat-map.module').then((m) => m.SeatMapModule),
      },
      {
        path: 'my-bookings',
        loadChildren: () => import('./my-bookings/my-bookings.module').then((m) => m.MyBookingsModule),
      },
      { path: 'chat', loadChildren: () => import('./chat/chat.module').then((m) => m.ChatModule) },
      { path: 'chat/:roomId', loadChildren: () => import('./chat/chat.module').then((m) => m.ChatModule) },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
