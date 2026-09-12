import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
})
export class LoginComponent {
  email = '';
  password = '';
  submitting = false;
  error = '';

  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  submit(): void {
    if (!this.email || !this.password) {
      this.error = 'Enter your email and password.';
      return;
    }
    this.submitting = true;
    this.error = '';
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (err) => {
        this.error = err.message || 'Login failed';
        this.submitting = false;
      },
    });
  }
}
