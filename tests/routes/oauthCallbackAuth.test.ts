import { describe, expect, it, vi } from "vitest";

import { IRACING_OAUTH_COOKIE_NAME } from "@/lib/auth/iracingOAuthCookie";
import { createSignedValue } from "@/lib/auth/signed";
import { createSessionCookieValue, readSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";

vi.mock("@/lib/auth/iracing", async () => {
    const actual = await vi.importActual<any>("@/lib/auth/iracing");
    return {
        ...actual,
        exchangeAuthorizationCodeForToken: vi.fn(),
        fetchIracingProfile: vi.fn(),
    };
});

vi.mock("@/lib/iracing/memberInfo", () => ({
    fetchIracingMemberInfo: vi.fn(),
}));

vi.mock("@/lib/iracing/tokenStore", () => ({
    storeIracingAuthTokens: vi.fn(),
}));

import { GET as callbackGet } from "@/app/oauth/callback/route";
import { exchangeAuthorizationCodeForToken } from "@/lib/auth/iracing";
import { getCnaOAuthCookieSecret } from "@/lib/auth/secrets";
import { fetchIracingMemberInfo } from "@/lib/iracing/memberInfo";
import { storeIracingAuthTokens } from "@/lib/iracing/tokenStore";

function getSetCookies(res: Response): string[] {
    const h = res.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof h.getSetCookie === "function") return h.getSetCookie();
    const single = res.headers.get("set-cookie");
    return single ? [single] : [];
}

function extractCookieValue(setCookie: string, name: string): string | null {
    const m = setCookie.match(new RegExp(`${name}=([^;]*);`));
    return m?.[1] ?? null;
}

function makeRequest(url: string, cookies: Record<string, string> = {}) {
    return {
        nextUrl: new URL(url),
        cookies: {
            get(name: string) {
                const value = cookies[name];
                return value === undefined ? undefined : { value };
            },
        },
    } as any;
}

describe("app/oauth/callback (iracing.auth)", () => {
    it("stores tokens and redirects back to next path", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        vi.mocked(exchangeAuthorizationCodeForToken).mockResolvedValueOnce({
            access_token: "ACCESS",
            refresh_token: "REFRESH",
            expires_in: 60,
            refresh_token_expires_in: 3600,
            scope: "iracing.auth",
        } as any);

        vi.mocked(fetchIracingMemberInfo).mockResolvedValueOnce({
            custId: 15535,
            displayName: "John West",
            licenses: [],
        } as any);

        vi.mocked(storeIracingAuthTokens).mockResolvedValueOnce(undefined);

        const now = Date.now();
        const oauthCookie = createSignedValue(
            {
                v: 1,
                state: "STATE",
                codeVerifier: "VERIFIER",
                next: "/account",
                scope: "iracing.auth",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const sessionCookie = createSessionCookieValue(
            { iracingCustId: 15535, iracingName: "John West" },
            { maxAgeSeconds: 60 * 60 }
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: oauthCookie,
            [SESSION_COOKIE_NAME]: sessionCookie,
        });
        const res = await callbackGet(req);

        expect(vi.mocked(exchangeAuthorizationCodeForToken)).toHaveBeenCalledWith({
            code: "CODE",
            codeVerifier: "VERIFIER",
            scope: "iracing.auth",
        });
        expect(vi.mocked(fetchIracingMemberInfo)).toHaveBeenCalledWith("ACCESS");
        expect(vi.mocked(storeIracingAuthTokens)).toHaveBeenCalledTimes(1);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/account");

        const setCookies = getSetCookies(res);
        const sessionLine = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
        expect(sessionLine).toBeTruthy();

        const sessionValue = extractCookieValue(sessionLine!, SESSION_COOKIE_NAME);
        const session = readSessionCookieValue(sessionValue ?? undefined);
        expect(session?.user.iracingCustId).toBe(15535);
        expect(session?.user.iracingName).toBe("John West");
    });

    it("rejects mismatch between existing session user and authorized member", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        vi.mocked(exchangeAuthorizationCodeForToken).mockResolvedValueOnce({
            access_token: "ACCESS",
            refresh_token: "REFRESH",
            expires_in: 60,
            refresh_token_expires_in: 3600,
            scope: "iracing.auth",
        } as any);

        vi.mocked(fetchIracingMemberInfo).mockResolvedValueOnce({
            custId: 2,
            displayName: "Other User",
            licenses: [],
        } as any);

        const now = Date.now();
        const oauthCookie = createSignedValue(
            {
                v: 1,
                state: "STATE",
                codeVerifier: "VERIFIER",
                next: "/account",
                scope: "iracing.auth",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const sessionCookie = createSessionCookieValue(
            { iracingCustId: 1, iracingName: "John West" },
            { maxAgeSeconds: 60 * 60 }
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: oauthCookie,
            [SESSION_COOKIE_NAME]: sessionCookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/account");
        expect(loc.searchParams.get("error")).toBe("invalid_request");
        expect(vi.mocked(storeIracingAuthTokens)).not.toHaveBeenCalled();
    });
});

