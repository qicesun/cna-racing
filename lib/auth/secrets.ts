import "server-only";

function getStrongSecret(envKey: string): string | null {
    const value = process.env[envKey];
    if (!value) return null;
    if (value.length < 32) return null;
    return value;
}

export function getCnaSessionSecret(): string {
    const secret = getStrongSecret("CNA_SESSION_SECRET");
    if (secret) return secret;

    if (process.env.NODE_ENV === "production") {
        throw new Error("Missing CNA_SESSION_SECRET (set a >=32 char random string).");
    }

    // Dev-only fallback: keeps local work moving, but should never be used in production.
    return "dev-only-insecure-secret-change-me";
}

export function getCnaOAuthCookieSecret(): string {
    // Optional separation-of-duties. If not set, fall back to the session secret.
    const secret = getStrongSecret("CNA_OAUTH_COOKIE_SECRET");
    return secret ?? getCnaSessionSecret();
}

export function getCnaTokenEncryptionSecret(): string {
    // Optional separation-of-duties. If not set, fall back to the session secret.
    const secret = getStrongSecret("CNA_TOKEN_ENC_SECRET");
    return secret ?? getCnaSessionSecret();
}
