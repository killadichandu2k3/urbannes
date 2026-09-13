// Development environment config. This file is NOT where secrets go —
// Google's OAuth Client ID is a public identifier by design (Google
// Identity Services expects it directly in client-side JS; the actual
// secret half of OAuth apps that need one never belongs here or on any
// frontend). See environment.prod.ts for the production counterpart, and
// the root .env.example for the matching auth-api-side GOOGLE_CLIENT_ID.
export const environment = {
  production: false,
  googleClientId: 'your-client-id.apps.googleusercontent.com',
};
