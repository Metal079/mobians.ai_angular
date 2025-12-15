export const environment = {
  production: false,
  // OAuth unified redirect used by both providers (must be whitelisted in provider dashboards)
  oauthRedirectUri: 'http://localhost:4200/auth/callback',
  // Kept for legacy fallback (should match oauthRedirectUri)
  discordRedirectUri: 'http://localhost:4200/auth/callback',
  // Client IDs (set actual values in dev)
  discordClientId: '1186062405168549949',
  googleClientId: '705855401047-0kr2m6jvp5foa8mjm1f05lrmcvtmo6v3.apps.googleusercontent.com',
  apiBaseUrl: 'http://localhost:8001',
  isDevJob: true,
  // PayPal (sandbox for dev)
  paypalClientId: 'AZJtYStugvvDqrqwfzlniBJWJ8bUYPlLUTE-vT8AeUxGy7JrKyO51TpzFo3RAUSJfHKNInCsEPTdahK-',
};
