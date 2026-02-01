import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/currentUser", () => ({
    getCurrentUser: vi.fn(),
}));

import { GET as meGet } from "@/app/api/me/route";
import { getCurrentUser } from "@/lib/auth/currentUser";

describe("app/api/me route", () => {
    it("returns { user: null } when not logged in", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await meGet();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ user: null });
    });

    it("returns the current user when logged in", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({
            iracingCustId: 15535,
            iracingName: "John West",
        });
        const res = await meGet();
        await expect(res.json()).resolves.toEqual({
            user: { iracingCustId: 15535, iracingName: "John West" },
        });
    });
});

