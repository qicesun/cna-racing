import { describe, expect, it, vi } from "vitest";

import { createSignedValue } from "@/lib/auth/signed";
import { createSessionCookieValue, readSessionCookieValue } from "@/lib/auth/session";

describe("lib/auth/session", () => {
    it("creates a signed session with server-side expiry enforcement", () => {
        const oldSecret = process.env.CNA_SESSION_SECRET;
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));

        try {
            const cookie = createSessionCookieValue(
                { iracingCustId: 15535, iracingName: "John West" },
                { maxAgeSeconds: 2 }
            );

            const s1 = readSessionCookieValue(cookie);
            expect(s1?.user.iracingCustId).toBe(15535);
            expect(s1?.user.iracingName).toBe("John West");

            // Still valid at +1s
            vi.setSystemTime(new Date("2026-02-01T00:00:01.000Z"));
            expect(readSessionCookieValue(cookie)).not.toBeNull();

            // Expired at +3s
            vi.setSystemTime(new Date("2026-02-01T00:00:03.000Z"));
            expect(readSessionCookieValue(cookie)).toBeNull();
        } finally {
            vi.useRealTimers();
            if (oldSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSecret;
        }
    });

    it("rejects tampering", () => {
        const oldSecret = process.env.CNA_SESSION_SECRET;
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        try {
            const cookie = createSessionCookieValue({ iracingCustId: 1, iracingName: "A" });
            const tampered = cookie.replace(".", ".x");
            expect(readSessionCookieValue(tampered)).toBeNull();
        } finally {
            if (oldSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSecret;
        }
    });

    it("rejects invalid payload shapes even if signature is valid", () => {
        const oldSecret = process.env.CNA_SESSION_SECRET;
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        try {
            const now = Date.now();
            const bad = createSignedValue(
                {
                    v: 1,
                    iat: now,
                    exp: now + 60_000,
                    user: { iracingCustId: "not-a-number", iracingName: "" },
                },
                process.env.CNA_SESSION_SECRET
            );
            expect(readSessionCookieValue(bad)).toBeNull();

            const badName = createSignedValue(
                {
                    v: 1,
                    iat: now,
                    exp: now + 60_000,
                    user: { iracingCustId: 123, iracingName: "" },
                },
                process.env.CNA_SESSION_SECRET
            );
            expect(readSessionCookieValue(badName)).toBeNull();
        } finally {
            if (oldSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSecret;
        }
    });
});
