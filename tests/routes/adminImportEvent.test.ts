import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin", () => ({
    requireAdminUser: vi.fn(),
}));

vi.mock("@/lib/events/catalog", () => ({
    getEventById: vi.fn(),
    normalizeEventId: (v: string) => v,
    parseEventId: (eventId: string) => {
        const parts = eventId.split(":");
        if (parts.length !== 3) return null;
        const [seriesKey, seasonKey, roundRaw] = parts;
        const round = Number(roundRaw);
        if (!seriesKey || !seasonKey) return null;
        if (!Number.isFinite(round) || !Number.isInteger(round) || round <= 0) return null;
        return { seriesKey, seasonKey, round };
    },
}));

vi.mock("@/lib/db/cnaEventSources", () => ({
    getCnaEventSourceByEventId: vi.fn(),
}));

vi.mock("@/lib/db/cnaEventResults", () => ({
    upsertCnaEventResult: vi.fn(),
    listCnaEventResultsBySeriesSeason: vi.fn(),
}));

vi.mock("@/lib/db/cnaSeriesStandings", () => ({
    upsertCnaSeriesStandings: vi.fn(),
}));

vi.mock("@/lib/iracing/results", () => ({
    fetchIracingSubsessionResult: vi.fn(),
}));

vi.mock("@/lib/iracing/tokenStore", () => ({
    getValidIracingAuthAccessToken: vi.fn(),
}));

import { POST } from "@/app/api/admin/import-event/route";
import { requireAdminUser } from "@/lib/auth/admin";
import { getEventById } from "@/lib/events/catalog";
import { getCnaEventSourceByEventId } from "@/lib/db/cnaEventSources";
import { listCnaEventResultsBySeriesSeason, upsertCnaEventResult } from "@/lib/db/cnaEventResults";
import { upsertCnaSeriesStandings } from "@/lib/db/cnaSeriesStandings";
import { fetchIracingSubsessionResult } from "@/lib/iracing/results";
import { getValidIracingAuthAccessToken } from "@/lib/iracing/tokenStore";
import { parseIracingRaceResult } from "@/lib/results/parseEventResult";

describe("app/api/admin/import-event route", () => {
    it("returns 400 when advanced auth is missing", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce({ seriesKey: "gt3open" } as any);
        vi.mocked(getCnaEventSourceByEventId).mockResolvedValueOnce({
            eventId: "gt3open:26S1:8",
            seriesKey: "gt3open",
            subsessionId: 83007142,
            createdBy: 1127717,
            createdAt: "x",
            updatedAt: "y",
        });
        vi.mocked(getValidIracingAuthAccessToken).mockResolvedValueOnce(null);

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("not_connected");
    });

    it("imports event result and updates standings", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce({ seriesKey: "gt3open" } as any);
        vi.mocked(getCnaEventSourceByEventId).mockResolvedValueOnce({
            eventId: "gt3open:26S1:8",
            seriesKey: "gt3open",
            subsessionId: 83007142,
            createdBy: 1127717,
            createdAt: "x",
            updatedAt: "y",
        });
        vi.mocked(getValidIracingAuthAccessToken).mockResolvedValueOnce("token");

        const raw = {
            data: {
                start_time: "2026-02-01T00:00:00Z",
                track: { track_name: "Suzuka" },
                session_results: [
                    {
                        simsession_number: 0,
                        simsession_name: "RACE",
                        results: [{ cust_id: 1, display_name: "A", finish_position: 0, champ_points: 25 }],
                    },
                ],
            },
        };
        vi.mocked(fetchIracingSubsessionResult).mockResolvedValueOnce(raw);

        const parsed = parseIracingRaceResult(raw);
        vi.mocked(listCnaEventResultsBySeriesSeason).mockResolvedValueOnce([
            {
                eventId: "gt3open:26S1:8",
                raceResults: parsed.raceResults,
            } as any,
        ]);

        vi.mocked(upsertCnaEventResult).mockResolvedValueOnce(undefined);
        vi.mocked(upsertCnaSeriesStandings).mockResolvedValueOnce(undefined);

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.imported.eventId).toBe("gt3open:26S1:8");

        expect(upsertCnaEventResult).toHaveBeenCalled();
        expect(upsertCnaSeriesStandings).toHaveBeenCalledWith(
            expect.objectContaining({ seriesKey: "gt3open", seasonKey: "26S1" })
        );
    });
});

