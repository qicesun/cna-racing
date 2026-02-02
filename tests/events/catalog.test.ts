import { describe, expect, it } from "vitest";

import { deriveSeasonKey, getEventById, makeEventId, parseEventId } from "@/lib/events/catalog";

describe("lib/events/catalog", () => {
    it("derives a stable season key for CNA seasons", () => {
        expect(deriveSeasonKey("Season 26S1")).toBe("26S1");
        expect(deriveSeasonKey("season 99s2")).toBe("99S2");
    });

    it("builds and parses event ids", () => {
        const id = makeEventId("gt3open", "26S1", 7);
        expect(id).toBe("gt3open:26S1:7");
        expect(parseEventId(id)).toEqual({ seriesKey: "gt3open", seasonKey: "26S1", round: 7 });
        expect(parseEventId("bad")).toBeNull();
        expect(parseEventId("a:b:0")).toBeNull();
    });

    it("finds known events from static schedule data", () => {
        const id = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        const event = getEventById(id);
        expect(event).toBeTruthy();
        expect(event?.eventId).toBe(id);
        expect(event?.seriesKey).toBe("gt3open");
        expect(event?.round).toBe(1);
    });
});

