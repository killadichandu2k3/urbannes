// ============================================================================
// Route guard — redirects to /login when there's no logged-in user. Applied
// to every route except /login and /register themselves (see
// app-routing.module.ts). Angular 17 still uses the class-based
// CanActivate interface here (not the newer functional canActivate()
// style) to match every other service in this app being a plain injectable
// class, not because the functional style is unavailable in v17.
// ============================================================================

import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  canActivate(): boolean | UrlTree {
    if (this.auth.isLoggedIn) return true;
    return this.router.createUrlTree(['/auth/login']);
  }
}
