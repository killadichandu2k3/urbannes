// ============================================================================
// GOOGLE SIGN-IN — wraps the third-party `google.accounts.id` global
// (loaded via <script> in index.html — see its comment) behind one typed
// service, so no other file in this app needs to know Google Identity
// Services' callback-based API shape. Mirrors this app's existing pattern
// of isolating a third-party SDK behind one small service — see
// razorpay-checkout.service.ts for the Razorpay equivalent this was
// modeled on.
// ============================================================================

import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: GoogleIdConfig): void;
          renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
          prompt(): void;
        };
      };
    };
  }
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: { credential: string }) => void;
}

interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private initialized = false;

  /**
   * Renders the real Google-branded sign-in button into `container`, and
   * resolves with the signed ID token the moment the user completes
   * sign-in — the caller (LoginComponent/RegisterComponent) hands that
   * token straight to AuthService.loginWithGoogle(), which is the only
   * place that ever talks to auth-api about it.
   */
  renderButton(container: HTMLElement, onToken: (idToken: string) => void): void {
    if (!window.google) {
      // The GIS script (index.html) failed to load or hasn't finished yet
      // — fail quietly rather than throwing, since a slow/blocked script
      // load shouldn't break the rest of the login page. The button
      // simply won't appear; email/password sign-in still works.
      return;
    }
    if (!environment.googleClientId || environment.googleClientId.includes('your-client-id')) {
      // Unconfigured — same reasoning: don't throw, just skip rendering
      // the button so an unconfigured dev environment doesn't show a
      // button that would fail on click.
      return;
    }

    if (!this.initialized) {
      window.google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response) => onToken(response.credential),
      });
      this.initialized = true;
    }

    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 320,
    });
  }
}
