import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

// Lazy-loaded feature modules — the NgModule-era equivalent of code
// splitting per route.
//
// / is the public landing page (no guard) — a first-time visitor's
// entry point, with its own CTAs to sign up or browse events. Everything
// under it that touches real user/event data still requires sign-in via
// AuthGuard, same as before; only the root path itself became public.
//
// /auth/login and /auth/register are also public. Every other route
// requires a signed-in user, replacing the old "anyone gets a random
// anonymous id" model (see the removed SessionService and AuthService's
// header comment).
const routes: Routes = [
  { path: '', loadChildren: () => import('./landing/landing.module').then((m) => m.LandingModule) },
  // Single top-level path prefix, loaded once — AuthModule's own routes
  // (see auth.module.ts) supply 'login' and 'register' underneath it.
  { path: 'auth', loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule) },
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: 'home', loadChildren: () => import('./home/home.module').then((m) => m.HomeModule) },
      { path: 'events', loadChildren: () => import('./events/events.module').then((m) => m.EventsModule) },
      {
        path: 'events/:eventId/seats',
        loadChildren: () => import('./seat-map/seat-map.module').then((m) => m.SeatMapModule),
      },
      {
        path: 'my-bookings',
        loadChildren: () => import('./my-bookings/my-bookings.module').then((m) => m.MyBookingsModule),
      },
      { path: 'profile', loadChildren: () => import('./profile/profile.module').then((m) => m.ProfileModule) },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
