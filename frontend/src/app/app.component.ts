import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent {
  constructor(public readonly auth: AuthService, private readonly router: Router) {}

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
