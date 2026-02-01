import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
    cookies: vi.fn(),
}));

import { cookies } from "next/headers";

import { createSessionCookieValue } from "@/lib/auth/session";

describe("lib/auth/currentUser", () => {
    it("returns null when session cookie is missing", async () => {
        vi.mocked(cookies).mockResolvedValueOnce({
            get() {
                return undefined;
            },
        } as any);

        const { getCurrentUser } = await import("@/lib/auth/currentUser");
        await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("returns null when session cookie is invalid", async () => {
        vi.mocked(cookies).mockResolvedValueOnce({
            get() {
                return { value: "invalid" };
            },
        } as any);

        const { getCurrentUser } = await import("@/lib/auth/currentUser");
        await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("returns the user when session cookie is valid", async () => {
        const oldSecret = process.env.CNA_SESSION_SECRET;
        process.env.CNA_SESSION_SECRET = "s".repeat(40);

        try {
            const cookieValue = createSessionCookieValue({
                iracingCustId: 15535,
                iracingName: "John West",
            });

            vi.mocked(cookies).mockResolvedValueOnce({
                get() {
                    return { value: cookieValue };
                },
            } as any);

            const { getCurrentUser } = await import("@/lib/auth/currentUser");
            await expect(getCurrentUser()).resolves.toEqual({
                iracingCustId: 15535,
                iracingName: "John West",
            });
        } finally {
            if (oldSecret === undefined) delete process.env.CNA_SESSION_SECRET;
            else process.env.CNA_SESSION_SECRET = oldSecret;
        }
    });
});

