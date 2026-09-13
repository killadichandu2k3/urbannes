import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { GoogleAuthService } from '../core/services/google-auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('googleBtn') googleBtn?: ElementRef<HTMLElement>;

  email = '';
  password = '';
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
    if (!this.email || !this.password) {
      this.error = 'Enter your email and password.';
      return;
    }
    this.submitting = true;
    this.error = '';
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: (err) => {
        this.error = err.message || 'Login failed';
        this.submitting = false;
      },
    });
  }

  private onGoogleToken(idToken: string): void {
    this.error = '';
    this.auth.loginWithGoogle(idToken).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: (err) => {
        this.error = err.message || 'Google sign-in failed. Please try again.';
      },
    });
  }
}
