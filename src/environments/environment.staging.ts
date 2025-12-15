// Staging / preview-like configuration (stable staging environment recommended for OAuth)
// NOTE: PR preview URLs for Azure Static Web Apps are ephemeral; OAuth providers typically
// require exact redirect URIs to be whitelisted, so OAuth will usually NOT work on PR previews.

const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200';

export const environment = {
  production: true,
  // Uses current site origin so the same build can run on different staging hosts.
  // Add your staging host(s) to Discord + Google redirect allow-lists.
  oauthRedirectUri: `${origin}/auth/callback`,
  // Kept for legacy fallback (should match oauthRedirectUri)
  discordRedirectUri: `${origin}/auth/callback`,
  discordClientId: '1186062405168549949',
  googleClientId: '705855401047-0kr2m6jvp5foa8mjm1f05lrmcvtmo6v3.apps.googleusercontent.com',
  // TODO: point this at your staging API if you have one
  apiBaseUrl: 'https://api.mobians.ai',
  isDevJob: false,
  // PayPal (staging typically uses sandbox; replace if needed)
  paypalClientId: 'Abvbwdl-mP9GbFTglLpJcyLF8ZYlIY-pSwRqry68WgLNOrr0L2LdBcxXND20CaFX0dRxHOmqT03fxf_1',
};
