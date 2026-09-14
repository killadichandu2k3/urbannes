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

  renderButton(container: HTMLElement, onToken: (idToken: string) => void): void {
    if (!window.google) {

      return;
    }
    if (!environment.googleClientId || environment.googleClientId.includes('your-client-id')) {

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
