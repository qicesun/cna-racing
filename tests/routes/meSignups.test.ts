import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySignupStore } from "@/tests/helpers/inMemorySignupStore";

let store: InMemorySignupStore;

vi.mock("@/lib/auth/currentUser", () => ({
    getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/signup/store", () => ({
    getSignupStore: () => store,
}));

import { GET as meSignupsGet } from "@/app/api/me/signups/route";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { deriveSeasonKey, makeEventId } from "@/lib/events/catalog";

describe("app/api/me/signups route", () => {
    beforeEach(() => {
        store = new InMemorySignupStore();
        vi.mocked(getCurrentUser).mockReset();
    });

    it("returns empty when logged out", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await meSignupsGet();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ user: null, signups: [] });
    });

    it("returns the user's signups with event metadata", async () => {
        const user = { iracingCustId: 15535, iracingName: "John West" };
        vi.mocked(getCurrentUser).mockResolvedValueOnce(user);

        const eventId = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        await store.createSignup(eventId, user);

        const res = await meSignupsGet();
        const json = await res.json();

        expect(json.user).toEqual(user);
        expect(json.signups.length).toBe(1);
        expect(json.signups[0].event.eventId).toBe(eventId);
    });
});

