import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  displayName = '';
  email = '';
  password = '';
  confirmPassword = '';
  submitting = false;
  error = '';

  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  submit(): void {
    this.error = '';

    if (!this.displayName.trim() || !this.email || !this.password) {
      this.error = 'All fields are required.';
      return;
    }
    if (this.password.length < 8) {
      this.error = 'Password must be at least 8 characters.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.submitting = true;
    this.auth
      .register({ email: this.email, password: this.password, displayName: this.displayName.trim() })
      .subscribe({
        next: () => this.router.navigateByUrl('/events'),
        error: (err) => {
          this.error = err.message || 'Registration failed';
          this.submitting = false;
        },
      });
  }
}
