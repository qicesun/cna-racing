import { describe, expect, it } from "vitest";

import { computeSeriesStandings } from "@/lib/results/computeSeriesStandings";

describe("lib/results/computeSeriesStandings", () => {
    it("aggregates points/starts/wins/podiums across rounds", () => {
        const standings = computeSeriesStandings({
            seriesKey: "gt3open",
            seasonKey: "26S1",
            nowIso: "2026-02-03T00:00:00.000Z",
            events: [
                {
                    eventId: "gt3open:26S1:1",
                    raceResults: {
                        version: 1,
                        results: [
                            { custId: 1, name: "A", finishPosition: 1, points: 25 },
                            { custId: 2, name: "B", finishPosition: 2, points: 20 },
                        ],
                    },
                },
                {
                    eventId: "gt3open:26S1:2",
                    raceResults: {
                        version: 1,
                        results: [
                            { custId: 2, name: "B", finishPosition: 1, points: 25 },
                            { custId: 1, name: "A", finishPosition: 2, points: 20 },
                        ],
                    },
                },
            ],
        });

        expect(standings.version).toBe(1);
        expect(standings.seriesKey).toBe("gt3open");
        expect(standings.seasonKey).toBe("26S1");
        expect(standings.eventIds).toEqual(["gt3open:26S1:1", "gt3open:26S1:2"]);
        expect(standings.updatedAt).toBe("2026-02-03T00:00:00.000Z");

        const a = standings.standings.find((r) => r.custId === 1)!;
        const b = standings.standings.find((r) => r.custId === 2)!;
        expect(a).toMatchObject({ points: 45, starts: 2, wins: 1, podiums: 2 });
        expect(b).toMatchObject({ points: 45, starts: 2, wins: 1, podiums: 2 });
    });

    it("ignores events that don't match series/season or have invalid schema", () => {
        const standings = computeSeriesStandings({
            seriesKey: "rookie",
            seasonKey: "26S1",
            events: [
                { eventId: "gt3open:26S1:1", raceResults: { version: 1, results: [] } },
                { eventId: "rookie:26S1:1", raceResults: { version: 2, results: [] } },
                { eventId: "rookie:26S1:1", raceResults: { version: 1, results: [{ custId: 1, name: "A", finishPosition: 1, points: 25 }] } },
            ],
        });

        expect(standings.eventIds).toEqual(["rookie:26S1:1"]);
        expect(standings.standings.length).toBe(1);
        expect(standings.standings[0]).toMatchObject({ custId: 1, points: 25, wins: 1, podiums: 1, starts: 1 });
    });
});

