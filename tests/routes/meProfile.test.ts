import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/currentUser", () => ({
    getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/cnaUsers", () => ({
    upsertCnaUser: vi.fn(),
}));

vi.mock("@/lib/db/cnaUserProfiles", () => ({
    getCnaUserProfile: vi.fn(),
    upsertCnaUserProfile: vi.fn(),
}));

import { GET as meProfileGet, PUT as meProfilePut } from "@/app/api/me/profile/route";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { upsertCnaUser } from "@/lib/db/cnaUsers";
import { getCnaUserProfile, upsertCnaUserProfile } from "@/lib/db/cnaUserProfiles";

describe("app/api/me/profile route", () => {
    it("GET returns { user: null, profile: null } when not logged in", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await meProfileGet();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ user: null, profile: null });
    });

    it("GET returns profile when logged in", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 1, iracingName: "A" });
        vi.mocked(getCnaUserProfile).mockResolvedValueOnce({
            iracingCustId: 1,
            nickname: "Nick",
            discord: null,
            bio: null,
            preferredCar: null,
            carNumber: null,
            links: [],
            createdAt: "x",
            updatedAt: "y",
        });

        const res = await meProfileGet();
        await expect(res.json()).resolves.toEqual({
            user: { iracingCustId: 1, iracingName: "A" },
            profile: {
                nickname: "Nick",
                discord: null,
                bio: null,
                preferredCar: null,
                carNumber: null,
                links: [],
            },
        });
    });

    it("PUT returns 401 when not logged in", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await meProfilePut({ json: async () => ({}) } as any);
        expect(res.status).toBe(401);
    });

    it("PUT returns 400 on invalid payload", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 1, iracingName: "A" });
        const res = await meProfilePut({ json: async () => ({ links: "nope" }) } as any);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_request");
    });

    it("PUT upserts user + profile on success", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 1, iracingName: "A" });
        vi.mocked(upsertCnaUser).mockResolvedValueOnce(undefined);
        vi.mocked(upsertCnaUserProfile).mockResolvedValueOnce(undefined);

        const res = await meProfilePut({
            json: async () => ({
                nickname: "Nick",
                links: [{ label: "Site", url: "https://example.com" }],
            }),
        } as any);

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ ok: true });
        expect(upsertCnaUser).toHaveBeenCalledWith({ iracingCustId: 1, iracingName: "A" });
        expect(upsertCnaUserProfile).toHaveBeenCalledWith(1, expect.any(Object));
    });
});

