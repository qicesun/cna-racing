import { describe, expect, it } from "vitest";

import { coverFromTrackKey, deriveSeasonKey, getEventById, makeEventId, normalizeEventId, parseEventId } from "@/lib/events/catalog";

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

    it("normalizes percent-encoded event id params", () => {
        expect(normalizeEventId("gt3open%3A26S1%3A1")).toBe("gt3open:26S1:1");
        expect(normalizeEventId("gt3open:26S1:1")).toBe("gt3open:26S1:1");
        // Invalid escape sequences should not crash the page/router.
        expect(normalizeEventId("%E0%A4%A")).toBe("%E0%A4%A");
    });

    it("finds known events from static schedule data", () => {
        const id = makeEventId("gt3open", deriveSeasonKey("Season 26S1"), 1);
        const event = getEventById(id);
        expect(event).toBeTruthy();
        expect(event?.eventId).toBe(id);
        expect(event?.seriesKey).toBe("gt3open");
        expect(event?.round).toBe(1);
        expect(event?.trackKey).toBe("imola");
        expect(event?.cover).toBe("/tracks/imola.png");
    });

    it("builds cover paths from track keys", () => {
        expect(coverFromTrackKey("suzuka")).toBe("/tracks/suzuka.png");
        expect(coverFromTrackKey()).toBeNull();
    });
});
