// ============================================================================
// AuthService — replaces the old SessionService's "just pick a random
// display name" placeholder (see its removed comment) with a real signup/
// login flow against auth-api's register/login mutations (composed into
// the same Apollo Gateway schema every other GraphqlService call already
// uses — see graphql.module.ts).
//
// The issued JWT is kept in localStorage (not an httpOnly cookie) so it can
// be read here and attached as an Authorization header by authInterceptor —
// this matches the chain that already existed end-to-end (NGINX -> Apollo
// Gateway -> subgraphs all forward `authorization`), rather than requiring
// a new cookie-forwarding path this project doesn't have.
// ============================================================================

import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { AuthUser } from '../models';

const TOKEN_KEY = 'urbannest_auth_token';
const USER_KEY = 'urbannest_auth_user';

const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) { token user { id email displayName } }
  }
`;

const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) { token user { id email displayName } }
  }
`;

const ME_QUERY = gql`
  query Me { me { id email displayName } }
`;

interface AuthPayload {
  token: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(this.readStoredUser());
  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly apollo: Apollo) {}

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  register(input: { email: string; password: string; displayName: string }): Observable<AuthUser> {
    return this.apollo
      .mutate<{ register: AuthPayload }>({ mutation: REGISTER_MUTATION, variables: { input } })
      .pipe(
        map((result) => result.data!.register),
        tap((payload) => this.persistSession(payload)),
        map((payload) => payload.user),
      );
  }

  login(input: { email: string; password: string }): Observable<AuthUser> {
    return this.apollo
      .mutate<{ login: AuthPayload }>({ mutation: LOGIN_MUTATION, variables: { input } })
      .pipe(
        map((result) => result.data!.login),
        tap((payload) => this.persistSession(payload)),
        map((payload) => payload.user),
      );
  }

  /** Re-validates the stored token against auth-api on app boot — see APP_INITIALIZER in app.module.ts. */
  restoreSession(): Observable<AuthUser | null> {
    if (!this.token) return new Observable((sub) => { sub.next(null); sub.complete(); });
    return this.apollo
      .query<{ me: AuthUser | null }>({ query: ME_QUERY, fetchPolicy: 'network-only' })
      .pipe(
        map((result) => result.data.me),
        tap((user) => {
          if (user) this.userSubject.next(user);
          else this.clearSession(); // token expired/invalid server-side
        }),
      );
  }

  logout(): void {
    this.clearSession();
  }

  private persistSession(payload: AuthPayload): void {
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    this.userSubject.next(payload.user);
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSubject.next(null);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
