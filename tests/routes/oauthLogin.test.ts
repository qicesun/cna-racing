import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

import { GET as loginGet } from "@/app/oauth/login/route";
import { IRACING_OAUTH_COOKIE_NAME } from "@/lib/auth/iracingOAuthCookie";
import { getCnaOAuthCookieSecret } from "@/lib/auth/secrets";
import { readSignedValue } from "@/lib/auth/signed";
import { base64UrlEncode } from "@/lib/auth/utils";

function getSetCookies(res: Response): string[] {
    const h = res.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof h.getSetCookie === "function") return h.getSetCookie();
    const single = res.headers.get("set-cookie");
    return single ? [single] : [];
}

function extractCookieValue(setCookie: string, name: string): string | null {
    const m = setCookie.match(new RegExp(`${name}=([^;]+);`));
    return m?.[1] ?? null;
}

describe("app/oauth/login route", () => {
    it("blocks localhost when redirectUri is production (origin mismatch)", async () => {
        const oldRedirect = process.env.IRACING_REDIRECT_URI;
        process.env.IRACING_REDIRECT_URI = "https://cna-racing.vercel.app/oauth/callback";

        try {
            const req = { nextUrl: new URL("http://localhost:3000/oauth/login?next=/") } as any;
            const res = await loginGet(req);

            expect(res.status).toBe(307);
            const loc = res.headers.get("location");
            expect(loc).toBeTruthy();

            const parsed = new URL(loc!);
            expect(parsed.pathname).toBe("/account");
            expect(parsed.searchParams.get("error")).toBe("invalid_request");
            expect(parsed.searchParams.get("error_description")).toMatch(/origin mismatch/i);
        } finally {
            process.env.IRACING_REDIRECT_URI = oldRedirect;
        }
    });

    it("sets a signed OAuth cookie and redirects to /authorize with matching state+PKCE", async () => {
        const oldRedirect = process.env.IRACING_REDIRECT_URI;
        const oldOAuthSecret = process.env.CNA_OAUTH_COOKIE_SECRET;
        const oldSessionSecret = process.env.CNA_SESSION_SECRET;

        process.env.IRACING_REDIRECT_URI = "https://cna-racing.vercel.app/oauth/callback";
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        try {
            const req = { nextUrl: new URL("https://cna-racing.vercel.app/oauth/login?next=/drivers") } as any;
            const res = await loginGet(req);

            expect(res.status).toBe(307);

            const loc = res.headers.get("location");
            expect(loc).toBeTruthy();
            const authorize = new URL(loc!);
            expect(authorize.origin).toBe("https://oauth.iracing.com");
            expect(authorize.pathname).toBe("/oauth2/authorize");
            expect(authorize.searchParams.get("response_type")).toBe("code");
            expect(authorize.searchParams.get("scope")).toBe("iracing.profile");

            const stateParam = authorize.searchParams.get("state");
            const challengeParam = authorize.searchParams.get("code_challenge");
            expect(stateParam).toBeTruthy();
            expect(challengeParam).toBeTruthy();

            const setCookies = getSetCookies(res);
            expect(setCookies.join("\n")).toContain(`${IRACING_OAUTH_COOKIE_NAME}=`);

            const cookieLine = setCookies.find((c) => c.startsWith(`${IRACING_OAUTH_COOKIE_NAME}=`));
            expect(cookieLine).toBeTruthy();

            const cookieValue = extractCookieValue(cookieLine!, IRACING_OAUTH_COOKIE_NAME);
            expect(cookieValue).toBeTruthy();

            const payload = readSignedValue<any>(cookieValue!, getCnaOAuthCookieSecret());
            expect(payload?.v).toBe(1);
            expect(payload?.next).toBe("/drivers");
            expect(payload?.state).toBe(stateParam);

            const expectedChallenge = base64UrlEncode(
                createHash("sha256").update(payload.codeVerifier, "utf8").digest()
            );
            expect(challengeParam).toBe(expectedChallenge);
        } finally {
            process.env.IRACING_REDIRECT_URI = oldRedirect;
            if (oldOAuthSecret === undefined) delete process.env.CNA_OAUTH_COOKIE_SECRET;
            else process.env.CNA_OAUTH_COOKIE_SECRET = oldOAuthSecret;
            if (oldSessionSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSessionSecret;
        }
    });

    it("sanitizes next to prevent open redirects", async () => {
        const oldRedirect = process.env.IRACING_REDIRECT_URI;
        const oldOAuthSecret = process.env.CNA_OAUTH_COOKIE_SECRET;
        const oldSessionSecret = process.env.CNA_SESSION_SECRET;

        process.env.IRACING_REDIRECT_URI = "https://cna-racing.vercel.app/oauth/callback";
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        try {
            const req = { nextUrl: new URL("https://cna-racing.vercel.app/oauth/login?next=https://evil.com") } as any;
            const res = await loginGet(req);

            const setCookies = getSetCookies(res);
            const cookieLine = setCookies.find((c) => c.startsWith(`${IRACING_OAUTH_COOKIE_NAME}=`));
            expect(cookieLine).toBeTruthy();

            const cookieValue = extractCookieValue(cookieLine!, IRACING_OAUTH_COOKIE_NAME);
            const payload = readSignedValue<any>(cookieValue!, getCnaOAuthCookieSecret());
            expect(payload?.next).toBe("/");
        } finally {
            process.env.IRACING_REDIRECT_URI = oldRedirect;
            if (oldOAuthSecret === undefined) delete process.env.CNA_OAUTH_COOKIE_SECRET;
            else process.env.CNA_OAUTH_COOKIE_SECRET = oldOAuthSecret;
            if (oldSessionSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSessionSecret;
        }
    });
});
