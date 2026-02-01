import { describe, expect, it, vi } from "vitest";

import { IRACING_OAUTH_COOKIE_NAME } from "@/lib/auth/iracingOAuthCookie";
import { createSignedValue } from "@/lib/auth/signed";
import { readSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";

vi.mock("@/lib/auth/iracing", async () => {
    const actual = await vi.importActual<any>("@/lib/auth/iracing");
    return {
        ...actual,
        exchangeAuthorizationCodeForToken: vi.fn(),
        fetchIracingProfile: vi.fn(),
    };
});

import { GET as callbackGet } from "@/app/oauth/callback/route";
import { exchangeAuthorizationCodeForToken, fetchIracingProfile, IracingOAuthError } from "@/lib/auth/iracing";
import { getCnaOAuthCookieSecret } from "@/lib/auth/secrets";

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

describe("app/oauth/callback route", () => {
    it("redirects to /account when auth server returns an error param", async () => {
        const req = makeRequest(
            "https://cna-racing.vercel.app/oauth/callback?error=access_denied&error_description=nope"
        );
        const res = await callbackGet(req);

        expect(res.status).toBe(307);
        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/account");
        expect(loc.searchParams.get("error")).toBe("access_denied");
        expect(loc.searchParams.get("error_description")).toBe("nope");

        // Should clear the oauth cookie.
        expect(getSetCookies(res).join("\n")).toContain(`${IRACING_OAUTH_COOKIE_NAME}=`);
    });

    it("redirects with invalid_request when code/state are missing", async () => {
        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback");
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/account");
        expect(loc.searchParams.get("error")).toBe("invalid_request");
    });

    it("redirects with invalid_request when oauth cookie is missing", async () => {
        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE");
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("invalid_request");
    });

    it("rejects an invalid oauth cookie signature", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const payload = {
            v: 1,
            state: "STATE",
            codeVerifier: "VERIFIER",
            next: "/",
            iat: Date.now(),
            exp: Date.now() + 60_000,
        };

        const badCookie = createSignedValue(payload, "wrong-secret");

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: badCookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("invalid_request");
    });

    it("rejects an expired oauth cookie", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
        try {
            const now = Date.now();
            const cookie = createSignedValue(
                {
                    v: 1,
                    state: "STATE",
                    codeVerifier: "VERIFIER",
                    next: "/",
                    iat: now - 60_000,
                    exp: now - 1,
                },
                getCnaOAuthCookieSecret()
            );

            const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
                [IRACING_OAUTH_COOKIE_NAME]: cookie,
            });
            const res = await callbackGet(req);

            const loc = new URL(res.headers.get("location")!);
            expect(loc.searchParams.get("error")).toBe("invalid_request");
            expect(loc.searchParams.get("error_description")).toMatch(/expired/i);
        } finally {
            vi.useRealTimers();
        }
    });

    it("rejects a state mismatch", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const now = Date.now();
        const cookie = createSignedValue(
            {
                v: 1,
                state: "STATE_A",
                codeVerifier: "VERIFIER",
                next: "/",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE_B", {
            [IRACING_OAUTH_COOKIE_NAME]: cookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("invalid_request");
        expect(loc.searchParams.get("error_description")).toMatch(/state/i);
    });

    it("rejects a cookie with valid signature but invalid types", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const now = Date.now();
        const cookie = createSignedValue(
            {
                v: 1,
                state: 123,
                codeVerifier: true,
                next: {},
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: cookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("invalid_request");
        expect(loc.searchParams.get("error_description")).toMatch(/bad types/i);
    });

    it("returns server_error when IRACING_CLIENT_SECRET is missing in production", async () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldIracingSecret = process.env.IRACING_CLIENT_SECRET;
        const oldOAuthSecret = process.env.CNA_OAUTH_COOKIE_SECRET;

        process.env.NODE_ENV = "production";
        delete process.env.IRACING_CLIENT_SECRET;
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);

        try {
            const now = Date.now();
            const cookie = createSignedValue(
                {
                    v: 1,
                    state: "STATE",
                    codeVerifier: "VERIFIER",
                    next: "/",
                    iat: now,
                    exp: now + 60_000,
                },
                getCnaOAuthCookieSecret()
            );

            const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
                [IRACING_OAUTH_COOKIE_NAME]: cookie,
            });
            const res = await callbackGet(req);

            const loc = new URL(res.headers.get("location")!);
            expect(loc.searchParams.get("error")).toBe("server_error");
            expect(loc.searchParams.get("error_description")).toMatch(/IRACING_CLIENT_SECRET/i);
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            if (oldIracingSecret === undefined) delete process.env.IRACING_CLIENT_SECRET;
            else process.env.IRACING_CLIENT_SECRET = oldIracingSecret;
            if (oldOAuthSecret === undefined) delete process.env.CNA_OAUTH_COOKIE_SECRET;
            else process.env.CNA_OAUTH_COOKIE_SECRET = oldOAuthSecret;
        }
    });

    it("returns server_error when /token throws a non-IracingOAuthError", async () => {
        const tokenMock = vi.mocked(exchangeAuthorizationCodeForToken);
        tokenMock.mockRejectedValueOnce(new Error("boom"));

        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const now = Date.now();
        const cookie = createSignedValue(
            {
                v: 1,
                state: "STATE",
                codeVerifier: "VERIFIER",
                next: "/",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: cookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("server_error");
        expect(loc.searchParams.get("error_description")).toBe("boom");
    });

    it("returns server_error when /iracing/profile throws", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const tokenMock = vi.mocked(exchangeAuthorizationCodeForToken);
        const profileMock = vi.mocked(fetchIracingProfile);

        tokenMock.mockResolvedValueOnce({
            access_token: "ACCESS",
            scope: "iracing.profile",
        } as any);
        profileMock.mockRejectedValueOnce(new Error("profile fail"));

        const now = Date.now();
        const cookie = createSignedValue(
            {
                v: 1,
                state: "STATE",
                codeVerifier: "VERIFIER",
                next: "/",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: cookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("server_error");
        expect(loc.searchParams.get("error_description")).toBe("profile fail");
    });

    it("returns server_error when session cookie creation fails", async () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldSessionSecret = process.env.CNA_SESSION_SECRET;
        const oldOAuthSecret = process.env.CNA_OAUTH_COOKIE_SECRET;
        const oldIracingSecret = process.env.IRACING_CLIENT_SECRET;

        process.env.NODE_ENV = "production";
        delete process.env.CNA_SESSION_SECRET;
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.IRACING_CLIENT_SECRET = "dummy";

        try {
            const tokenMock = vi.mocked(exchangeAuthorizationCodeForToken);
            const profileMock = vi.mocked(fetchIracingProfile);

            tokenMock.mockResolvedValueOnce({
                access_token: "ACCESS",
                scope: "iracing.profile",
            } as any);
            profileMock.mockResolvedValueOnce({
                iracing_name: "John West",
                iracing_cust_id: 15535,
            });

            const now = Date.now();
            const cookie = createSignedValue(
                {
                    v: 1,
                    state: "STATE",
                    codeVerifier: "VERIFIER",
                    next: "/",
                    iat: now,
                    exp: now + 60_000,
                },
                getCnaOAuthCookieSecret()
            );

            const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
                [IRACING_OAUTH_COOKIE_NAME]: cookie,
            });
            const res = await callbackGet(req);

            const loc = new URL(res.headers.get("location")!);
            expect(loc.searchParams.get("error")).toBe("server_error");
            expect(loc.searchParams.get("error_description")).toMatch(/CNA_SESSION_SECRET/i);
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            if (oldSessionSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSessionSecret;
            if (oldOAuthSecret === undefined) delete process.env.CNA_OAUTH_COOKIE_SECRET;
            else process.env.CNA_OAUTH_COOKIE_SECRET = oldOAuthSecret;
            if (oldIracingSecret === undefined) delete process.env.IRACING_CLIENT_SECRET;
            else process.env.IRACING_CLIENT_SECRET = oldIracingSecret;
        }
    });

    it("maps IracingOAuthError from /token to user-facing redirect params", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const tokenMock = vi.mocked(exchangeAuthorizationCodeForToken);
        tokenMock.mockRejectedValueOnce(new IracingOAuthError("invalid_grant", "bad code"));

        const now = Date.now();
        const cookie = createSignedValue(
            {
                v: 1,
                state: "STATE",
                codeVerifier: "VERIFIER",
                next: "/",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: cookie,
        });
        const res = await callbackGet(req);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.searchParams.get("error")).toBe("invalid_grant");
        expect(loc.searchParams.get("error_description")).toBe("bad code");
    });

    it("on success, clears oauth cookie, sets session cookie, and redirects to next path", async () => {
        process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        const tokenMock = vi.mocked(exchangeAuthorizationCodeForToken);
        const profileMock = vi.mocked(fetchIracingProfile);

        tokenMock.mockResolvedValueOnce({
            access_token: "ACCESS",
            scope: "iracing.profile",
        } as any);

        profileMock.mockResolvedValueOnce({
            iracing_name: "John West",
            iracing_cust_id: 15535,
        });

        const now = Date.now();
        const cookie = createSignedValue(
            {
                v: 1,
                state: "STATE",
                codeVerifier: "VERIFIER",
                next: "/drivers",
                iat: now,
                exp: now + 60_000,
            },
            getCnaOAuthCookieSecret()
        );

        const req = makeRequest("https://cna-racing.vercel.app/oauth/callback?code=CODE&state=STATE", {
            [IRACING_OAUTH_COOKIE_NAME]: cookie,
        });
        const res = await callbackGet(req);

        expect(tokenMock).toHaveBeenCalledWith({
            code: "CODE",
            codeVerifier: "VERIFIER",
            scope: "iracing.profile",
        });
        expect(profileMock).toHaveBeenCalledWith("ACCESS");

        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/drivers");

        const setCookies = getSetCookies(res);
        expect(setCookies.join("\n")).toContain(`${IRACING_OAUTH_COOKIE_NAME}=`);
        expect(setCookies.join("\n")).toContain(`${SESSION_COOKIE_NAME}=`);

        const sessionLine = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
        expect(sessionLine).toBeTruthy();

        const sessionValue = extractCookieValue(sessionLine!, SESSION_COOKIE_NAME);
        const session = readSessionCookieValue(sessionValue ?? undefined);
        expect(session?.user.iracingCustId).toBe(15535);
        expect(session?.user.iracingName).toBe("John West");
    });
});
