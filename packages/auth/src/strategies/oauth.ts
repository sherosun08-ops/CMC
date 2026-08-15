// OAuth/Social login strategies — unified provider interface

export interface OAuthProvider {
  name: string; // "google", "github", "apple"
  getAuthorizationUrl(state: string, redirectUri: string): string;
  getTokenFromCode(code: string, redirectUri: string): Promise<OAuthToken>;
  getProfile(token: OAuthToken): Promise<OAuthProfile>;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;
}

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified?: boolean;
}

export const oauthProviders: Map<string, OAuthProvider> = new Map();

export function registerOAuthProvider(provider: OAuthProvider): void {
  oauthProviders.set(provider.name, provider);
}

export function getOAuthProvider(name: string): OAuthProvider | undefined {
  return oauthProviders.get(name);
}

export function getEnabledOAuthProviders(): string[] {
  const providers: string[] = [];
  if (process.env.GOOGLE_CLIENT_ID) providers.push('google');
  if (process.env.GITHUB_CLIENT_ID) providers.push('github');
  if (process.env.APPLE_CLIENT_ID) providers.push('apple');
  return providers;
}