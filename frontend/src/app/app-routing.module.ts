import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

const routes: Routes = [
  { path: '', loadChildren: () => import('./landing/landing.module').then((m) => m.LandingModule) },

  { path: 'auth', loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule) },
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', loadChildren: () => import('./home/home.module').then((m) => m.HomeModule) },
      { path: 'home', redirectTo: 'dashboard', pathMatch: 'full' },
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
