import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySignupStore } from "@/tests/helpers/inMemorySignupStore";

let store: InMemorySignupStore;

vi.mock("@/lib/auth/currentUser", () => ({
    getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/signup/store", () => ({
    getSignupStore: () => store,
}));

import { GET as statusGet } from "@/app/api/events/status/route";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { deriveSeasonKey, makeEventId } from "@/lib/events/catalog";

function makeRequest(url: string) {
    return { nextUrl: new URL(url) } as any;
}

describe("app/api/events/status route", () => {
    beforeEach(() => {
        store = new InMemorySignupStore();
        vi.mocked(getCurrentUser).mockReset();
    });

    it("returns {} when ids is missing", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await statusGet(makeRequest("https://cna-racing.vercel.app/api/events/status"));
        await expect(res.json()).resolves.toEqual({ events: {} });
    });

    it("rejects unknown event ids", async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await statusGet(makeRequest("https://cna-racing.vercel.app/api/events/status?ids=bad:id:1"));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe("invalid_request");
        expect(json.unknown).toEqual(["bad:id:1"]);
    });

    it("returns counts, and signedUp=false when not logged in", async () => {
        const eventId = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        await store.createSignup(eventId, { iracingCustId: 1, iracingName: "A" });
        await store.createSignup(eventId, { iracingCustId: 2, iracingName: "B" });

        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        const res = await statusGet(makeRequest(`https://cna-racing.vercel.app/api/events/status?ids=${encodeURIComponent(eventId)}`));
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            events: {
                [eventId]: { count: 2, signedUp: false },
            },
        });
    });

    it("marks signedUp=true for the current user", async () => {
        const eventA = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        const eventB = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 2);

        await store.createSignup(eventA, { iracingCustId: 42, iracingName: "Me" });
        await store.createSignup(eventA, { iracingCustId: 7, iracingName: "Other" });
        await store.createSignup(eventB, { iracingCustId: 7, iracingName: "Other" });

        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 42, iracingName: "Me" });
        const res = await statusGet(
            makeRequest(
                `https://cna-racing.vercel.app/api/events/status?ids=${encodeURIComponent(`${eventA},${eventB}`)}`
            )
        );

        const json = await res.json();
        expect(json.events[eventA]).toEqual({ count: 2, signedUp: true });
        expect(json.events[eventB]).toEqual({ count: 1, signedUp: false });
    });
});

