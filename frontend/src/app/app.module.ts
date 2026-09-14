import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AppRoutingModule } from './app-routing.module';
import { GraphQLModule } from './graphql.module';
import { AppComponent } from './app.component';
import { NotificationBellComponent } from './shared/notification-bell.component';
import { AuthInterceptor } from './core/services/auth.interceptor';
import { AuthService } from './core/services/auth.service';

function initializeAuth(auth: AuthService) {
  return () => auth.restoreSession().pipe(catchError(() => of(null))).toPromise();
}

@NgModule({
  declarations: [AppComponent, NotificationBellComponent],
  imports: [BrowserModule, AppRoutingModule, GraphQLModule],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: APP_INITIALIZER, useFactory: initializeAuth, deps: [AuthService], multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
