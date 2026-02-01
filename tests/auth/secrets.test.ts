import { describe, expect, it } from "vitest";

import { getCnaOAuthCookieSecret, getCnaSessionSecret } from "@/lib/auth/secrets";

describe("lib/auth/secrets", () => {
    it("getCnaSessionSecret returns a dev fallback when not set (non-production)", () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldSessionSecret = process.env.CNA_SESSION_SECRET;
        try {
            process.env.NODE_ENV = "test";
            delete process.env.CNA_SESSION_SECRET;

            expect(getCnaSessionSecret()).toContain("dev-only-insecure-secret");
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            if (oldSessionSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSessionSecret;
        }
    });

    it("getCnaSessionSecret throws in production when missing/weak", () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldSessionSecret = process.env.CNA_SESSION_SECRET;
        try {
            process.env.NODE_ENV = "production";
            delete process.env.CNA_SESSION_SECRET;
            expect(() => getCnaSessionSecret()).toThrow(/CNA_SESSION_SECRET/);

            process.env.CNA_SESSION_SECRET = "short";
            expect(() => getCnaSessionSecret()).toThrow(/CNA_SESSION_SECRET/);
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            if (oldSessionSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSessionSecret;
        }
    });

    it("getCnaOAuthCookieSecret prefers CNA_OAUTH_COOKIE_SECRET, falls back to session secret", () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldSessionSecret = process.env.CNA_SESSION_SECRET;
        const oldOAuthSecret = process.env.CNA_OAUTH_COOKIE_SECRET;
        try {
            process.env.NODE_ENV = "test";
            process.env.CNA_SESSION_SECRET = "s".repeat(40);
            delete process.env.CNA_OAUTH_COOKIE_SECRET;

            expect(getCnaOAuthCookieSecret()).toBe(process.env.CNA_SESSION_SECRET);

            process.env.CNA_OAUTH_COOKIE_SECRET = "o".repeat(40);
            expect(getCnaOAuthCookieSecret()).toBe(process.env.CNA_OAUTH_COOKIE_SECRET);
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            if (oldSessionSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSessionSecret;
            if (oldOAuthSecret === undefined) delete process.env.CNA_OAUTH_COOKIE_SECRET;
            else process.env.CNA_OAUTH_COOKIE_SECRET = oldOAuthSecret;
        }
    });
});
