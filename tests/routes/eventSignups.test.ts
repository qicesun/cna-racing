import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySignupStore } from "@/tests/helpers/inMemorySignupStore";

let store: InMemorySignupStore;

vi.mock("@/lib/signup/store", () => ({
    getSignupStore: () => store,
}));

import { GET as signupsGet } from "@/app/api/events/[eventId]/signups/route";
import { deriveSeasonKey, makeEventId } from "@/lib/events/catalog";

describe("app/api/events/[eventId]/signups route", () => {
    beforeEach(() => {
        store = new InMemorySignupStore();
    });

    it("returns 404 for unknown events", async () => {
        const res = await signupsGet({} as any, { params: { eventId: "bad:id:1" } } as any);
        expect(res.status).toBe(404);
    });

    it("returns an empty list when nobody signed up", async () => {
        const eventId = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        const res = await signupsGet({} as any, { params: { eventId } } as any);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.event.eventId).toBe(eventId);
        expect(json.count).toBe(0);
        expect(json.signups).toEqual([]);
    });

    it("lists signups in createdAt order", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
        try {
            const eventId = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);

            await store.createSignup(eventId, { iracingCustId: 2, iracingName: "B" });
            vi.advanceTimersByTime(1000);
            await store.createSignup(eventId, { iracingCustId: 1, iracingName: "A" });

            const res = await signupsGet({} as any, { params: { eventId } } as any);
            const json = await res.json();

            expect(json.count).toBe(2);
            expect(json.signups[0].user.iracingName).toBe("B");
            expect(json.signups[1].user.iracingName).toBe("A");
        } finally {
            vi.useRealTimers();
        }
    });
});

