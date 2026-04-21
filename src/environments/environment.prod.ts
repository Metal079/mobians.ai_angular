export const environment = {
  production: true,
  // OAuth unified redirect used by both providers (must be whitelisted in provider dashboards)
  oauthRedirectUri: 'https://mobians.ai/auth/callback',
  // Kept for legacy fallback (should match oauthRedirectUri)
  discordRedirectUri: 'https://mobians.ai/auth/callback',
  discordClientId: '1186062405168549949',
  googleClientId: '705855401047-0kr2m6jvp5foa8mjm1f05lrmcvtmo6v3.apps.googleusercontent.com',
  apiBaseUrl: 'https://api.mobians.ai',
  vapidPublicKey: 'BFn27FniJIkCEepHFNA8lWDpzRqsFT7jZlieyN0Zitjvk4e86TenzBKuX1jzLmDnSlgrG-W2HviHIHkAQy59z0A',
  isDevJob: false,
  // PayPal (live - replace with your live client ID)
  paypalClientId: 'Abvbwdl-mP9GbFTglLpJcyLF8ZYlIY-pSwRqry68WgLNOrr0L2LdBcxXND20CaFX0dRxHOmqT03fxf_1',
};
