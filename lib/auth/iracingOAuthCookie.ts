import "server-only";

export const IRACING_OAUTH_COOKIE_NAME = "cna_iracing_oauth";
export const IRACING_OAUTH_COOKIE_PATH = "/oauth";
export const IRACING_OAUTH_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

export type IracingOAuthCookiePayloadV1 = {
    v: 1;
    state: string;
    codeVerifier: string;
    next: string;
    iat: number;
    exp: number;
};

