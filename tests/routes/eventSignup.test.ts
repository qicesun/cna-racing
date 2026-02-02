import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySignupStore } from "@/tests/helpers/inMemorySignupStore";

let store: InMemorySignupStore;

vi.mock("@/lib/auth/currentUser", () => ({
    getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/signup/store", () => ({
    getSignupStore: () => store,
}));

import { DELETE as signupDelete, POST as signupPost } from "@/app/api/events/[eventId]/signup/route";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { deriveSeasonKey, makeEventId } from "@/lib/events/catalog";

describe("app/api/events/[eventId]/signup route", () => {
    beforeEach(() => {
        store = new InMemorySignupStore();
        vi.mocked(getCurrentUser).mockReset();
    });

    it("requires login for POST/DELETE", async () => {
        const eventId = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        vi.mocked(getCurrentUser).mockResolvedValue(null);

        const postRes = await signupPost({} as any, { params: { eventId } } as any);
        expect(postRes.status).toBe(401);

        const delRes = await signupDelete({} as any, { params: { eventId } } as any);
        expect(delRes.status).toBe(401);
    });

    it("returns 404 for unknown events", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ iracingCustId: 1, iracingName: "A" });
        const res = await signupPost({} as any, { params: { eventId: "bad:id:1" } } as any);
        expect(res.status).toBe(404);
    });

    it("creates signups idempotently and allows cancellation", async () => {
        const eventId = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        vi.mocked(getCurrentUser).mockResolvedValue({ iracingCustId: 15535, iracingName: "John West" });

        const first = await signupPost({} as any, { params: { eventId } } as any);
        expect(first.status).toBe(200);
        await expect(first.json()).resolves.toEqual({ ok: true, created: true });

        const second = await signupPost({} as any, { params: { eventId } } as any);
        await expect(second.json()).resolves.toEqual({ ok: true, created: false });

        const del1 = await signupDelete({} as any, { params: { eventId } } as any);
        await expect(del1.json()).resolves.toEqual({ ok: true, deleted: true });

        const del2 = await signupDelete({} as any, { params: { eventId } } as any);
        await expect(del2.json()).resolves.toEqual({ ok: true, deleted: false });
    });
});

