import { describe, expect, it } from "vitest";

import { parseIracingRaceResult } from "@/lib/results/parseEventResult";

describe("lib/results/parseEventResult", () => {
    it("parses track/start_time and uses champ_points when present", () => {
        const raw = {
            data: {
                start_time: "2026-02-01T00:00:00Z",
                track: { track_name: "Suzuka", config_name: "Grand Prix" },
                session_results: [
                    {
                        simsession_number: 0,
                        simsession_name: "RACE",
                        results: [
                            { cust_id: 1, display_name: "Alice", finish_position: 0, champ_points: 25, incidents: 2 },
                            { cust_id: 2, display_name: "Bob", finish_position: 1, champ_points: 20, incidents: 1 },
                        ],
                    },
                ],
            },
        };

        const parsed = parseIracingRaceResult(raw);
        expect(parsed.startTime).toBe("2026-02-01T00:00:00Z");
        expect(parsed.trackName).toBe("Suzuka - Grand Prix");
        expect(parsed.raceResults.version).toBe(1);
        expect(parsed.raceResults.results.map((r) => ({ custId: r.custId, points: r.points, finish: r.finishPosition }))).toEqual([
            { custId: 1, points: 25, finish: 1 },
            { custId: 2, points: 20, finish: 2 },
        ]);
    });

    it("falls back to points table when champ_points is missing", () => {
        const raw = {
            data: {
                session_results: [
                    {
                        simsession_number: 0,
                        simsession_name: "RACE",
                        results: [
                            { cust_id: 1, display_name: "A", finish_position: 0 },
                            { cust_id: 2, display_name: "B", finish_position: 1 },
                            { cust_id: 3, display_name: "C", finish_position: 2 },
                        ],
                    },
                ],
            },
        };

        const parsed = parseIracingRaceResult(raw);
        expect(parsed.raceResults.results.map((r) => r.points)).toEqual([25, 20, 16]);
    });

    it("throws when RACE session is missing", () => {
        const raw = { data: { session_results: [{ simsession_name: "QUALIFY", results: [] }] } };
        expect(() => parseIracingRaceResult(raw)).toThrow(/RACE/);
    });
});

