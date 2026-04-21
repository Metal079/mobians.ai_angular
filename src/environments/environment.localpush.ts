const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200';

export const environment = {
  production: true,
  oauthRedirectUri: `${origin}/auth/callback`,
  discordRedirectUri: `${origin}/auth/callback`,
  discordClientId: '1186062405168549949',
  googleClientId: '705855401047-0kr2m6jvp5foa8mjm1f05lrmcvtmo6v3.apps.googleusercontent.com',
  apiBaseUrl: 'http://localhost:8002',
  vapidPublicKey: 'BPbnK_IH_tF427HnxUi92CBmOpNWOk_LK9IgakxQALNmdzcN_0R07nz18swt2EwtsfWXe0fr3ScdYTvoIJ3wVQA',
  isDevJob: true,
  paypalClientId: 'AZJtYStugvvDqrqwfzlniBJWJ8bUYPlLUTE-vT8AeUxGy7JrKyO51TpzFo3RAUSJfHKNInCsEPTdahK-',
};