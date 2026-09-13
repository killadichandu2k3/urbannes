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

const TOKEN_KEY = 'urbannes_auth_token';
const USER_KEY = 'urbannes_auth_user';

const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) { email message }
  }
`;

const VERIFY_EMAIL_MUTATION = gql`
  mutation VerifyEmail($email: String!, $code: String!) {
    verifyEmail(email: $email, code: $code) { token user { id email displayName hasPassword } }
  }
`;

const RESEND_CODE_MUTATION = gql`
  mutation ResendVerificationCode($email: String!) {
    resendVerificationCode(email: $email) { email message }
  }
`;

const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) { token user { id email displayName hasPassword } }
  }
`;

const LOGIN_WITH_GOOGLE_MUTATION = gql`
  mutation LoginWithGoogle($idToken: String!) {
    loginWithGoogle(idToken: $idToken) { token user { id email displayName hasPassword } }
  }
`;

const UPDATE_PROFILE_MUTATION = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) { id email displayName hasPassword }
  }
`;

const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input)
  }
`;

const ME_QUERY = gql`
  query Me { me { id email displayName hasPassword } }
`;

interface AuthPayload {
  token: string;
  user: AuthUser;
}

interface RegistrationStarted {
  email: string;
  message: string;
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

  /** Starts registration: creates the account (unverified) and emails a 6-digit code. No session is created yet — see verifyEmail(). */
  register(input: { email: string; password: string; displayName: string }): Observable<RegistrationStarted> {
    return this.apollo
      .mutate<{ register: RegistrationStarted }>({ mutation: REGISTER_MUTATION, variables: { input } })
      .pipe(map((result) => result.data!.register));
  }

  /** Completes registration: verifies the emailed code and, on success, signs the user in (persists the session same as login()). */
  verifyEmail(input: { email: string; code: string }): Observable<AuthUser> {
    return this.apollo
      .mutate<{ verifyEmail: AuthPayload }>({ mutation: VERIFY_EMAIL_MUTATION, variables: input })
      .pipe(
        map((result) => result.data!.verifyEmail),
        tap((payload) => this.persistSession(payload)),
        map((payload) => payload.user),
      );
  }

  resendVerificationCode(email: string): Observable<RegistrationStarted> {
    return this.apollo
      .mutate<{ resendVerificationCode: RegistrationStarted }>({ mutation: RESEND_CODE_MUTATION, variables: { email } })
      .pipe(map((result) => result.data!.resendVerificationCode));
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

  /** Same login shape as login(), just credentialed by a Google ID token instead of email+password — see GoogleAuthService for how idToken is obtained. */
  loginWithGoogle(idToken: string): Observable<AuthUser> {
    return this.apollo
      .mutate<{ loginWithGoogle: AuthPayload }>({ mutation: LOGIN_WITH_GOOGLE_MUTATION, variables: { idToken } })
      .pipe(
        map((result) => result.data!.loginWithGoogle),
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

  /** Updates displayName and refreshes the locally cached session so the navbar/profile reflect it immediately, without waiting for the next restoreSession(). */
  updateProfile(input: { displayName: string }): Observable<AuthUser> {
    return this.apollo
      .mutate<{ updateProfile: AuthUser }>({ mutation: UPDATE_PROFILE_MUTATION, variables: { input } })
      .pipe(
        map((result) => result.data!.updateProfile),
        tap((user) => {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this.userSubject.next(user);
        }),
      );
  }

  changePassword(input: { currentPassword: string; newPassword: string }): Observable<boolean> {
    return this.apollo
      .mutate<{ changePassword: boolean }>({ mutation: CHANGE_PASSWORD_MUTATION, variables: { input } })
      .pipe(map((result) => result.data!.changePassword));
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
