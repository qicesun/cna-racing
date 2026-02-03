import { describe, expect, it, vi } from "vitest";

import {
    buildIracingAuthorizeUrl,
    exchangeAuthorizationCodeForToken,
    fetchIracingProfile,
    IracingOAuthError,
    maskClientSecret,
    refreshIracingToken,
} from "@/lib/auth/iracing";

describe("lib/auth/iracing", () => {
    it("maskClientSecret matches iRacing masking algorithm", () => {
        // Base64(SHA-256(secret + normalized_client_id))
        expect(maskClientSecret("secret", "cna-racing")).toBe("tD657t5DeU3iWKjbgMMsRo9eZbIy6GgzlpIiKlt3tDc=");
        expect(maskClientSecret("secret", " CNA-RACING ")).toBe("tD657t5DeU3iWKjbgMMsRo9eZbIy6GgzlpIiKlt3tDc=");
    });

    it("buildIracingAuthorizeUrl includes required query params", () => {
        const url = buildIracingAuthorizeUrl({
            baseUrl: "https://oauth.iracing.com/oauth2",
            clientId: "cna-racing",
            redirectUri: "https://cna-racing.vercel.app/oauth/callback",
            scope: "iracing.profile",
            state: "STATE",
            codeChallenge: "CHALLENGE",
            codeChallengeMethod: "S256",
        });

        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe("https://oauth.iracing.com/oauth2/authorize");
        expect(parsed.searchParams.get("client_id")).toBe("cna-racing");
        expect(parsed.searchParams.get("redirect_uri")).toBe("https://cna-racing.vercel.app/oauth/callback");
        expect(parsed.searchParams.get("response_type")).toBe("code");
        expect(parsed.searchParams.get("scope")).toBe("iracing.profile");
        expect(parsed.searchParams.get("state")).toBe("STATE");
        expect(parsed.searchParams.get("code_challenge")).toBe("CHALLENGE");
        expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("exchangeAuthorizationCodeForToken posts a masked secret and url-encodes it", async () => {
        const oldEnv = {
            IRACING_OAUTH_BASE_URL: process.env.IRACING_OAUTH_BASE_URL,
            IRACING_CLIENT_ID: process.env.IRACING_CLIENT_ID,
            IRACING_CLIENT_SECRET: process.env.IRACING_CLIENT_SECRET,
            IRACING_REDIRECT_URI: process.env.IRACING_REDIRECT_URI,
        };

        process.env.IRACING_OAUTH_BASE_URL = "https://example.test/oauth2";
        process.env.IRACING_CLIENT_ID = "cna-racing";
        process.env.IRACING_CLIENT_SECRET = "secret";
        process.env.IRACING_REDIRECT_URI = "https://cna-racing.vercel.app/oauth/callback";

        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(_url).toBe("https://example.test/oauth2/token");
            expect(init?.method).toBe("POST");
            expect(init?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });

            const body = String(init?.body ?? "");
            const masked = maskClientSecret("secret", "cna-racing");
            expect(body).toContain(`client_secret=${encodeURIComponent(masked)}`);
            expect(body).toContain("grant_type=authorization_code");
            expect(body).toContain("client_id=cna-racing");
            expect(body).toContain("code=CODE");
            expect(body).toContain(`redirect_uri=${encodeURIComponent("https://cna-racing.vercel.app/oauth/callback")}`);
            expect(body).toContain("code_verifier=VERIFIER");

            return new Response(JSON.stringify({
                access_token: "ACCESS",
                token_type: "Bearer",
                expires_in: 60,
                scope: "iracing.profile",
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });

        vi.stubGlobal("fetch", fetchMock);

        try {
            const token = await exchangeAuthorizationCodeForToken({
                code: "CODE",
                codeVerifier: "VERIFIER",
                scope: "iracing.profile",
            });
            expect(token.access_token).toBe("ACCESS");
        } finally {
            vi.unstubAllGlobals();
            process.env.IRACING_OAUTH_BASE_URL = oldEnv.IRACING_OAUTH_BASE_URL;
            process.env.IRACING_CLIENT_ID = oldEnv.IRACING_CLIENT_ID;
            process.env.IRACING_CLIENT_SECRET = oldEnv.IRACING_CLIENT_SECRET;
            process.env.IRACING_REDIRECT_URI = oldEnv.IRACING_REDIRECT_URI;
        }
    });

    it("exchangeAuthorizationCodeForToken throws a typed error on non-2xx", async () => {
        const oldBaseUrl = process.env.IRACING_OAUTH_BASE_URL;
        process.env.IRACING_OAUTH_BASE_URL = "https://example.test/oauth2";

        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({ error: "invalid_client", error_description: "bad client" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            )
        );
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(
                exchangeAuthorizationCodeForToken({
                    code: "CODE",
                    codeVerifier: "VERIFIER",
                    scope: "iracing.profile",
                })
            ).rejects.toBeInstanceOf(IracingOAuthError);
        } finally {
            vi.unstubAllGlobals();
            process.env.IRACING_OAUTH_BASE_URL = oldBaseUrl;
        }
    });

    it("refreshIracingToken posts a masked secret", async () => {
        const oldEnv = {
            IRACING_OAUTH_BASE_URL: process.env.IRACING_OAUTH_BASE_URL,
            IRACING_CLIENT_ID: process.env.IRACING_CLIENT_ID,
            IRACING_CLIENT_SECRET: process.env.IRACING_CLIENT_SECRET,
        };

        process.env.IRACING_OAUTH_BASE_URL = "https://example.test/oauth2";
        process.env.IRACING_CLIENT_ID = "cna-racing";
        process.env.IRACING_CLIENT_SECRET = "secret";

        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(_url).toBe("https://example.test/oauth2/token");
            expect(init?.method).toBe("POST");

            const body = String(init?.body ?? "");
            const masked = maskClientSecret("secret", "cna-racing");
            expect(body).toContain(`client_secret=${encodeURIComponent(masked)}`);
            expect(body).toContain("grant_type=refresh_token");
            expect(body).toContain("client_id=cna-racing");
            expect(body).toContain("refresh_token=REFRESH");

            return new Response(
                JSON.stringify({
                    access_token: "ACCESS_2",
                    refresh_token: "REFRESH_2",
                    expires_in: 60,
                    refresh_token_expires_in: 3600,
                    scope: "iracing.auth",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        });

        vi.stubGlobal("fetch", fetchMock);

        try {
            const token = await refreshIracingToken({ refreshToken: "REFRESH", scope: "iracing.auth" });
            expect(token.access_token).toBe("ACCESS_2");
        } finally {
            vi.unstubAllGlobals();
            process.env.IRACING_OAUTH_BASE_URL = oldEnv.IRACING_OAUTH_BASE_URL;
            process.env.IRACING_CLIENT_ID = oldEnv.IRACING_CLIENT_ID;
            process.env.IRACING_CLIENT_SECRET = oldEnv.IRACING_CLIENT_SECRET;
        }
    });

    it("exchangeAuthorizationCodeForToken rejects scope mismatch", async () => {
        const oldBaseUrl = process.env.IRACING_OAUTH_BASE_URL;
        process.env.IRACING_OAUTH_BASE_URL = "https://example.test/oauth2";

        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({ access_token: "ACCESS", scope: "iracing.auth" }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        );
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(
                exchangeAuthorizationCodeForToken({
                    code: "CODE",
                    codeVerifier: "VERIFIER",
                    scope: "iracing.profile",
                })
            ).rejects.toThrow(/scope mismatch/i);
        } finally {
            vi.unstubAllGlobals();
            process.env.IRACING_OAUTH_BASE_URL = oldBaseUrl;
        }
    });

    it("fetchIracingProfile calls /iracing/profile with Bearer token", async () => {
        const oldBaseUrl = process.env.IRACING_OAUTH_BASE_URL;
        process.env.IRACING_OAUTH_BASE_URL = "https://example.test/oauth2";

        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(_url).toBe("https://example.test/oauth2/iracing/profile");
            expect(init?.headers).toEqual({ Authorization: "Bearer ACCESS" });

            return new Response(JSON.stringify({
                iracing_name: "John West",
                iracing_cust_id: 15535,
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const profile = await fetchIracingProfile("ACCESS");
            expect(profile.iracing_name).toBe("John West");
            expect(profile.iracing_cust_id).toBe(15535);
        } finally {
            vi.unstubAllGlobals();
            process.env.IRACING_OAUTH_BASE_URL = oldBaseUrl;
        }
    });

    it("fetchIracingProfile throws on non-2xx", async () => {
        const oldBaseUrl = process.env.IRACING_OAUTH_BASE_URL;
        process.env.IRACING_OAUTH_BASE_URL = "https://example.test/oauth2";

        const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(fetchIracingProfile("ACCESS")).rejects.toThrow(/profile/i);
        } finally {
            vi.unstubAllGlobals();
            process.env.IRACING_OAUTH_BASE_URL = oldBaseUrl;
        }
    });
});
