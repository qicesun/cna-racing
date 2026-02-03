import "server-only";

export const IRACING_OAUTH_COOKIE_NAME = "cna_iracing_oauth";
export const IRACING_OAUTH_COOKIE_PATH = "/oauth";
export const IRACING_OAUTH_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

export type IracingOAuthScope = "iracing.profile" | "iracing.auth";

export type IracingOAuthCookiePayloadV1 = {
    v: 1;
    state: string;
    codeVerifier: string;
    next: string;
    scope?: IracingOAuthScope; // Optional for backwards compatibility (defaults to iracing.profile).
    iat: number;
    exp: number;
};
