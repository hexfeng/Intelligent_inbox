import { createHash, randomBytes } from "node:crypto";
import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import type { AppConfig } from "./config.js";
import { encryptSecret, hashSecret, randomToken } from "./crypto.js";
import type { Repository } from "./domain.js";
import { AppError, assertFound } from "./errors.js";

const IDENTITY_SCOPES = ["openid", "email", "profile"];
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export class OAuthService {
  constructor(private readonly config: AppConfig, private readonly repository: Repository) {}

  async begin(redirectUri: string, includeCalendar: boolean): Promise<{ authorization_url: string }> {
    this.assertRedirectUri(redirectUri);
    const state = randomToken(24);
    const verifier = randomBytes(48).toString("base64url");
    await this.repository.saveOAuthState({
      stateHash: hashSecret(state),
      verifier,
      redirectUri,
      includeCalendar,
      expiresAt: new Date(Date.now() + 10 * 60_000)
    });
    const oauth = new google.auth.OAuth2(this.config.GOOGLE_CLIENT_ID, this.config.GOOGLE_CLIENT_SECRET, redirectUri);
    const scopes = [...IDENTITY_SCOPES, ...GMAIL_SCOPES, ...(includeCalendar ? [CALENDAR_SCOPE] : [])];
    const authorization_url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: scopes,
      state,
      code_challenge: challenge(verifier),
      code_challenge_method: CodeChallengeMethod.S256
    });
    return { authorization_url };
  }

  async exchange(input: { code: string; state: string; redirect_uri: string }): Promise<{ session_token: string; email: string; scopes: string[] }> {
    const state = assertFound(
      await this.repository.consumeOAuthState(hashSecret(input.state)),
      "OAUTH_STATE_INVALID",
      "OAuth state is invalid or expired"
    );
    if (state.redirectUri !== input.redirect_uri) throw new AppError("OAUTH_REDIRECT_MISMATCH", "OAuth redirect does not match", 400);
    const oauth = new google.auth.OAuth2(this.config.GOOGLE_CLIENT_ID, this.config.GOOGLE_CLIENT_SECRET, state.redirectUri);
    const { tokens } = await oauth.getToken({ code: input.code, codeVerifier: state.verifier, redirect_uri: state.redirectUri });
    if (!tokens.id_token || !tokens.refresh_token) {
      throw new AppError("OAUTH_TOKENS_MISSING", "Google did not return the required identity and refresh tokens", 400);
    }
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: this.config.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new AppError("OAUTH_IDENTITY_INVALID", "Google identity is incomplete", 400);
    const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);
    const scopes = grantedScopes.length > 0
      ? grantedScopes
      : [...IDENTITY_SCOPES, ...GMAIL_SCOPES, ...(state.includeCalendar ? [CALENDAR_SCOPE] : [])];
    const account = await this.repository.upsertGoogleAccount({
      googleSub: payload.sub,
      email: payload.email,
      scopes,
      encryptedRefreshToken: encryptSecret(tokens.refresh_token, this.config.TOKEN_ENCRYPTION_KEY_BASE64)
    });
    const session_token = randomToken();
    await this.repository.createSession({
      tokenHash: hashSecret(session_token),
      userId: account.userId,
      accountId: account.accountId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000)
    });
    return { session_token, email: account.email, scopes: account.scopes };
  }

  private assertRedirectUri(redirectUri: string): void {
    const extensionRedirect = /^https:\/\/([a-p]{32})\.chromiumapp\.org\/google$/.exec(redirectUri);
    if (extensionRedirect) {
      const configuredExtension = /^chrome-extension:\/\/([a-p]{32})$/.exec(this.config.APP_ORIGIN)?.[1];
      if (!configuredExtension || configuredExtension === extensionRedirect[1]) return;
    }
    if (this.config.NODE_ENV !== "production" && /^http:\/\/127\.0\.0\.1(?::\d+)?\//.test(redirectUri)) return;
    throw new AppError("INVALID_REDIRECT_URI", "OAuth redirect is not registered for this extension", 400);
  }
}
