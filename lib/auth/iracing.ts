import "server-only";

import { createHash } from "crypto";

type IracingOAuthConfig = {
    baseUrl: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
};

export type IracingTokenResponse = {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
};

export type IracingProfile = {
    iracing_name: string;
    iracing_cust_id: number;
};

export class IracingOAuthError extends Error {
    public readonly error: string;
    public readonly errorDescription?: string;

    constructor(error: string, errorDescription?: string) {
        super(errorDescription ? `${error}: ${errorDescription}` : error);
        this.name = "IracingOAuthError";
        this.error = error;
        this.errorDescription = errorDescription;
    }
}

const DEFAULT_BASE_URL = "https://oauth.iracing.com/oauth2";
const DEFAULT_REDIRECT_URI = "https://cna-racing.vercel.app/oauth/callback";

export function getIracingOAuthConfig(): IracingOAuthConfig {
    const clientId = process.env.IRACING_CLIENT_ID ?? "cna-racing";
    const clientSecret = process.env.IRACING_CLIENT_SECRET;
    const redirectUri = process.env.IRACING_REDIRECT_URI ?? DEFAULT_REDIRECT_URI;

    return {
        baseUrl: process.env.IRACING_OAUTH_BASE_URL ?? DEFAULT_BASE_URL,
        clientId,
        clientSecret: clientSecret || undefined,
        redirectUri,
    };
}

export function buildIracingAuthorizeUrl(params: {
    baseUrl: string;
    clientId: string;
    redirectUri: string;
    scope: "iracing.profile" | "iracing.auth";
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256" | "plain";
}): string {
    const url = new URL(`${params.baseUrl}/authorize`);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", params.codeChallengeMethod);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", params.scope);
    return url.toString();
}

export function maskClientSecret(clientSecret: string, clientId: string): string {
    // iRacing requires masking the secret BEFORE URL encoding:
    // Base64(SHA-256(client_secret + normalized_client_id))
    const normalizedId = clientId.trim().toLowerCase();
    const combined = `${clientSecret}${normalizedId}`;
    return createHash("sha256").update(combined, "utf8").digest("base64");
}

export async function exchangeAuthorizationCodeForToken(params: {
    code: string;
    codeVerifier: string;
    scope: "iracing.profile" | "iracing.auth";
}): Promise<IracingTokenResponse> {
    const cfg = getIracingOAuthConfig();

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("client_id", cfg.clientId);
    form.set("code", params.code);
    form.set("redirect_uri", cfg.redirectUri);
    form.set("code_verifier", params.codeVerifier);

    // Confidential server-side clients MUST provide the secret if issued.
    if (cfg.clientSecret) {
        form.set("client_secret", maskClientSecret(cfg.clientSecret, cfg.clientId));
    }

    const res = await fetch(`${cfg.baseUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
    });

    const json = (await res.json()) as IracingTokenResponse;
    if (!res.ok) {
        const code = json.error || "server_error";
        const desc = json.error_description || `iRacing /token failed with HTTP ${res.status}`;
        throw new IracingOAuthError(code, desc);
    }

    // For safety: ensure the granted scope includes what we need.
    if (params.scope && json.scope && !json.scope.split(/\s+/).includes(params.scope)) {
        throw new Error(`iRacing token scope mismatch (got: ${json.scope})`);
    }

    return json;
}

export async function fetchIracingProfile(accessToken: string): Promise<IracingProfile> {
    const cfg = getIracingOAuthConfig();

    const res = await fetch(`${cfg.baseUrl}/iracing/profile`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`iRacing /iracing/profile failed with HTTP ${res.status}`);
    }

    return (await res.json()) as IracingProfile;
}
