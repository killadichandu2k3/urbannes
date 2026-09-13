import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
})
export class VerifyEmailComponent implements OnInit {
  email = '';
  code = '';
  submitting = false;
  resending = false;
  error = '';
  info = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.email = this.route.snapshot.queryParamMap.get('email') || '';
  }

  submit(): void {
    this.error = '';
    this.info = '';
    if (!this.email) {
      this.error = 'Missing email — go back and register again.';
      return;
    }
    if (!/^\d{6}$/.test(this.code.trim())) {
      this.error = 'Enter the 6-digit code from your email.';
      return;
    }

    this.submitting = true;
    this.auth.verifyEmail({ email: this.email, code: this.code.trim() }).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: (err) => {
        this.error = err.message || 'Verification failed';
        this.submitting = false;
      },
    });
  }

  resend(): void {
    if (!this.email) return;
    this.resending = true;
    this.error = '';
    this.info = '';
    this.auth.resendVerificationCode(this.email).subscribe({
      next: (result) => {
        this.info = result.message;
        this.resending = false;
      },
      error: (err) => {
        this.error = err.message || 'Could not resend code';
        this.resending = false;
      },
    });
  }
}
