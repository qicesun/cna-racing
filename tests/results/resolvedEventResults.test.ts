import { beforeEach, describe, expect, it, vi } from "vitest";

const listCnaEventResultSummariesBySeriesSeason = vi.fn();
const getCnaEventResultByEventId = vi.fn();

vi.mock("@/lib/db/cnaEventResults", () => ({
    listCnaEventResultSummariesBySeriesSeason: (args: any) => listCnaEventResultSummariesBySeriesSeason(args),
    getCnaEventResultByEventId: (eventId: string) => getCnaEventResultByEventId(eventId),
}));

const readFile = vi.fn();

vi.mock("fs/promises", () => ({
    default: {
        readFile: (p: any, enc: any) => readFile(p, enc),
    },
}));

import { getResolvedEventResultByEventId, listResolvedEventResultsBySeriesSeason } from "@/lib/results/resolvedEventResults";

describe("lib/results/resolvedEventResults", () => {
    beforeEach(() => {
        listCnaEventResultSummariesBySeriesSeason.mockReset();
        getCnaEventResultByEventId.mockReset();
        readFile.mockReset();
    });

    it("prefers DB results when present", async () => {
        listCnaEventResultSummariesBySeriesSeason.mockResolvedValueOnce([
            {
                eventId: "gt3open:26S1:1",
                seriesKey: "gt3open",
                subsessionId: 123,
                startTime: "2025-12-21T03:59:00Z",
                trackName: "Imola",
                raceResults: { version: 1, results: [] },
                fetchedAt: "2026-02-03T00:00:00.000Z",
            },
        ]);
        getCnaEventResultByEventId.mockResolvedValueOnce({
            eventId: "gt3open:26S1:1",
            seriesKey: "gt3open",
            subsessionId: 123,
            startTime: "2025-12-21T03:59:00Z",
            trackName: "Imola",
            rawJson: { data: { session_results: [{ simsession_name: "RACE", results: [] }] } },
            raceResults: { version: 1, results: [] },
            fetchedAt: "2026-02-03T00:00:00.000Z",
        });

        // No static index available.
        readFile.mockRejectedValue(new Error("missing"));

        const list = await listResolvedEventResultsBySeriesSeason({ seriesKey: "gt3open", seasonKey: "26S1" });
        expect(list.some((r) => r.eventId === "gt3open:26S1:1" && r.source === "db")).toBe(true);

        const single = await getResolvedEventResultByEventId("gt3open:26S1:1");
        expect(single?.source).toBe("db");
        expect(single?.subsessionId).toBe(123);
        expect(single?.fetchedAt).toBe("2026-02-03T00:00:00.000Z");
    });

    it("falls back to legacy static results when DB is missing", async () => {
        listCnaEventResultSummariesBySeriesSeason.mockResolvedValueOnce([]);
        getCnaEventResultByEventId.mockResolvedValueOnce(null);

        const index = JSON.stringify([{ id: "82056585", file: "/gt3open/results/r1.json" }]);
        const raw = JSON.stringify({
            data: {
                start_time: "2025-12-21T03:59:00Z",
                track: { track_name: "Imola", config_name: "GP" },
                session_results: [
                    {
                        simsession_number: 0,
                        simsession_name: "RACE",
                        results: [{ cust_id: 1, display_name: "A", finish_position: 0, champ_points: 25 }],
                    },
                ],
            },
        });

        readFile.mockImplementation((p: any) => {
            const s = String(p);
            if (s.includes("public") && s.includes("gt3open") && s.endsWith(`${pathSep()}gt3open${pathSep()}results${pathSep()}index.json`)) {
                return Promise.resolve(index);
            }
            if (s.includes("r1.json")) return Promise.resolve(raw);
            return Promise.reject(new Error(`unexpected read: ${s}`));
        });

        const single = await getResolvedEventResultByEventId("gt3open:26S1:1");
        expect(single?.source).toBe("static");
        expect(single?.raceResults.results.length).toBe(1);
        expect(single?.fetchedAt).toBeNull();

        const list = await listResolvedEventResultsBySeriesSeason({ seriesKey: "gt3open", seasonKey: "26S1" });
        expect(list.some((r) => r.eventId === "gt3open:26S1:1" && r.source === "static")).toBe(true);
    });

    it("returns null for invalid event ids", async () => {
        await expect(getResolvedEventResultByEventId("bad:id")).resolves.toBeNull();
    });
});

function pathSep(): string {
    // The module under test uses path.join(process.cwd(), "public", ...), which on Windows uses backslashes.
    // Keep the string matching in the mock implementation portable enough for our CI/dev environments.
    return process.platform === "win32" ? "\\" : "/";
}
