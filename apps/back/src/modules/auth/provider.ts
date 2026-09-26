/** Future providers must verify the external credential on the server before resolving an identity.
 * WeChat is deliberately not registered until its credentials and callback verification are implemented. */
export interface VerifiedIdentity {
  provider: string;
  appId: string;
  subject: string;
  unionId?: string;
}
export interface AuthenticationProvider {
  readonly name: string;
  verify(code: string, state: string): Promise<VerifiedIdentity>;
}
export const ENABLED_PROVIDERS = ['password'] as const;
