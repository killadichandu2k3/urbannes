import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { GoogleAuthService } from '../core/services/google-auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
})
export class RegisterComponent implements AfterViewInit {
  @ViewChild('googleBtn') googleBtn?: ElementRef<HTMLElement>;

  displayName = '';
  email = '';
  password = '';
  confirmPassword = '';
  submitting = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  ngAfterViewInit(): void {
    if (this.googleBtn) {
      this.googleAuth.renderButton(this.googleBtn.nativeElement, (idToken) => this.onGoogleToken(idToken));
    }
  }

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
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(this.password)) {
      this.error = 'Password must include an uppercase letter, a lowercase letter, and a number.';
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
        // register() no longer returns a session — it only creates the
        // account and emails a code. The verify screen is where a session
        // actually gets created (see VerifyEmailComponent).
        next: (result) => this.router.navigate(['/auth/verify'], { queryParams: { email: result.email } }),
        error: (err) => {
          this.error = err.message || 'Registration failed';
          this.submitting = false;
        },
      });
  }

  private onGoogleToken(idToken: string): void {
    this.error = '';
    // A Google account is verified and usable immediately — unlike
    // email/password registration, there is no OTP step to route through
    // first, so this goes straight to the same signed-in destination
    // login() and loginWithGoogle() both use.
    this.auth.loginWithGoogle(idToken).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: (err) => {
        this.error = err.message || 'Google sign-in failed. Please try again.';
      },
    });
  }
}
