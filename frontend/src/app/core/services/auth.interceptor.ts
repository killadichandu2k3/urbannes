// ============================================================================
// Attaches `Authorization: Bearer <token>` to every outgoing HTTP request
// (Apollo's HttpLink runs its POSTs through Angular's HttpClient, so a
// standard HttpInterceptor is the right place for this — no changes needed
// inside graphql.module.ts's link config itself). Replaces the old
// hardcoded `apikey: 'urbannest-frontend-dev-key'` header that graphql.
// module.ts sent unconditionally before real auth existed.
//
// Requests before login (register/login themselves, and any public query
// made while logged out) simply have no Authorization header — the backend
// resolvers that require auth (see booking-api's requireAuth()) reject
// those with UNAUTHENTICATED, same as a missing/expired token would.
// ============================================================================

import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly auth: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this.auth.token;
    if (!token) return next.handle(req);
    return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
}
