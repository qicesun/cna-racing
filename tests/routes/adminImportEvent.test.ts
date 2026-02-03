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
    listCnaEventResultSummariesBySeriesSeason: vi.fn(),
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
import { listCnaEventResultSummariesBySeriesSeason, upsertCnaEventResult } from "@/lib/db/cnaEventResults";
import { upsertCnaSeriesStandings } from "@/lib/db/cnaSeriesStandings";
import { fetchIracingSubsessionResult } from "@/lib/iracing/results";
import { getValidIracingAuthAccessToken } from "@/lib/iracing/tokenStore";
import { parseIracingRaceResult } from "@/lib/results/parseEventResult";

describe("app/api/admin/import-event route", () => {
    it("returns 401 when not authenticated", async () => {
        vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("Not authenticated."));
        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("unauthorized");
    });

    it("returns 403 when not authorized", async () => {
        vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("Not authorized."));
        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toBe("unauthorized");
    });

    it("returns 500 when admin auth throws unexpected errors", async () => {
        vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("boom"));
        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("server_error");
    });

    it("returns 400 on invalid JSON payload", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        const res = await POST({ json: async () => { throw new Error("bad"); } } as any);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_request");
    });

    it("returns 404 when event is not in catalog", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce(null);
        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("not_found");
    });

    it("returns 400 when event_id format is invalid", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce({ seriesKey: "gt3open" } as any);
        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:0" }) } as any);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_request");
    });

    it("returns 404 when source mapping is missing", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce({ seriesKey: "gt3open" } as any);
        vi.mocked(getCnaEventSourceByEventId).mockResolvedValueOnce(null);

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("not_found");
    });

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

    it("returns 502 when iRacing upstream fetch fails", async () => {
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
        vi.mocked(fetchIracingSubsessionResult).mockRejectedValueOnce(new Error("upstream down"));

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe("upstream_error");
    });

    it("returns 500 when parsing iRacing result fails", async () => {
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
        vi.mocked(fetchIracingSubsessionResult).mockResolvedValueOnce({
            data: { session_results: [] },
        }); // missing RACE session results -> parse error

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("parse_error");
    });

    it("returns 409 when validations fail (league mismatch)", async () => {
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

        vi.mocked(fetchIracingSubsessionResult).mockResolvedValueOnce({
            data: {
                league_id: 99999,
                track: { track_name: "Suzuka" },
                session_results: [
                    { simsession_number: 0, simsession_name: "RACE", results: [{ cust_id: 1, display_name: "A", finish_position: 0 }] },
                ],
            },
        });

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toBe("validation_failed");
    });

    it("returns 500 when persisting event result fails", async () => {
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
                session_results: [
                    { simsession_number: 0, simsession_name: "RACE", results: [{ cust_id: 1, display_name: "A", finish_position: 0 }] },
                ],
            },
        };
        vi.mocked(fetchIracingSubsessionResult).mockResolvedValueOnce(raw);
        vi.mocked(upsertCnaEventResult).mockRejectedValueOnce(new Error("db down"));

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("server_error");
        expect(body.error_description).toBe("db down");
    });

    it("returns 500 when standings computation fails", async () => {
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
                session_results: [
                    { simsession_number: 0, simsession_name: "RACE", results: [{ cust_id: 1, display_name: "A", finish_position: 0 }] },
                ],
            },
        };
        vi.mocked(fetchIracingSubsessionResult).mockResolvedValueOnce(raw);
        vi.mocked(upsertCnaEventResult).mockResolvedValueOnce(undefined);
        vi.mocked(listCnaEventResultSummariesBySeriesSeason).mockRejectedValueOnce(new Error("list failed"));

        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8" }) } as any);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("server_error");
        expect(body.error_description).toBe("list failed");
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
        vi.mocked(listCnaEventResultSummariesBySeriesSeason).mockResolvedValueOnce([
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
