import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AppRoutingModule } from './app-routing.module';
import { GraphQLModule } from './graphql.module';
import { AppComponent } from './app.component';
import { AuthInterceptor } from './core/services/auth.interceptor';
import { AuthService } from './core/services/auth.service';

// Runs once before the app finishes bootstrapping: if a token is already in
// localStorage (a page reload, not a fresh login), validate it against
// auth-api's `me` query so a stale/expired token doesn't silently pretend
// to be a live session. Errors are swallowed here (not surfaced to the
// user) — restoreSession() itself already clears the stored session on an
// invalid token, so the worst case is just "logged out," not a crash.
function initializeAuth(auth: AuthService) {
  return () => auth.restoreSession().pipe(catchError(() => of(null))).toPromise();
}

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, AppRoutingModule, GraphQLModule],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: APP_INITIALIZER, useFactory: initializeAuth, deps: [AuthService], multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
