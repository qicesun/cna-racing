import { describe, expect, it, vi } from "vitest";

type SupabaseResponse = { data?: any; error?: any };

function makeSupabaseClientMock() {
    const calls: any[] = [];
    const responses: Record<string, SupabaseResponse> = {};

    class Builder {
        private mode: "get" | "list" | null = null;

        constructor(private readonly table: string) {}

        upsert(payload: any, opts: any) {
            calls.push({ table: this.table, op: "upsert", payload, opts });
            return Promise.resolve(responses.upsert ?? { error: null });
        }

        select(selection: string) {
            calls.push({ table: this.table, op: "select", selection });
            return this;
        }

        eq(column: string, value: any) {
            calls.push({ table: this.table, op: "eq", column, value });
            if (column === "event_id") this.mode = "get";
            return this;
        }

        like(column: string, pattern: string) {
            calls.push({ table: this.table, op: "like", column, pattern });
            this.mode = "list";
            return this;
        }

        order(column: string, opts: any) {
            calls.push({ table: this.table, op: "order", column, opts });
            this.mode = "list";
            return this;
        }

        limit(n: number) {
            calls.push({ table: this.table, op: "limit", n });
            const key = this.mode ?? "list";
            return Promise.resolve((responses as any)[key] ?? { data: [], error: null });
        }
    }

    const client = {
        from(table: string) {
            calls.push({ table, op: "from" });
            return new Builder(table);
        },
    };

    return { client, calls, responses };
}

const getSupabaseAdminClient = vi.fn();

vi.mock("@/lib/db/supabaseAdmin", () => ({
    getSupabaseAdminClient: () => getSupabaseAdminClient(),
}));

import {
    getCnaEventResultByEventId,
    listCnaEventResultsBySeriesSeason,
    upsertCnaEventResult,
} from "@/lib/db/cnaEventResults";

describe("lib/db/cnaEventResults", () => {
    it("upserts event result by event_id", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.upsert = { error: null };
        getSupabaseAdminClient.mockReturnValue(client);

        await upsertCnaEventResult({
            eventId: "gt3open:26S1:8",
            seriesKey: "gt3open",
            subsessionId: 83007142,
            startTime: "2026-02-01T00:00:00Z",
            trackName: "Suzuka",
            rawJson: { raw: true },
            raceResults: { version: 1, results: [] },
            fetchedAt: "2026-02-03T00:00:00.000Z",
        });

        const upsertCall = calls.find((c) => c.table === "cna_event_results" && c.op === "upsert");
        expect(upsertCall).toBeTruthy();
        expect(upsertCall.payload.event_id).toBe("gt3open:26S1:8");
        expect(upsertCall.payload.series_key).toBe("gt3open");
        expect(upsertCall.payload.subsession_id).toBe(83007142);
        expect(upsertCall.payload.start_time).toBe("2026-02-01T00:00:00Z");
        expect(upsertCall.payload.track_name).toBe("Suzuka");
        expect(upsertCall.payload.raw_json).toEqual({ raw: true });
        expect(upsertCall.payload.race_results).toEqual({ version: 1, results: [] });
        expect(upsertCall.payload.fetched_at).toBe("2026-02-03T00:00:00.000Z");
    });

    it("gets event result by event_id", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    event_id: "gt3open:26S1:8",
                    series_key: "gt3open",
                    subsession_id: 83007142,
                    start_time: null,
                    track_name: null,
                    raw_json: { hello: "world" },
                    race_results: { version: 1, results: [] },
                    fetched_at: "2026-02-03T00:00:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaEventResultByEventId("gt3open:26S1:8")).resolves.toEqual({
            eventId: "gt3open:26S1:8",
            seriesKey: "gt3open",
            subsessionId: 83007142,
            startTime: null,
            trackName: null,
            rawJson: { hello: "world" },
            raceResults: { version: 1, results: [] },
            fetchedAt: "2026-02-03T00:00:00.000Z",
        });
    });

    it("lists event results by series + season using pattern match", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.list = {
            error: null,
            data: [
                {
                    event_id: "gt3open:26S1:8",
                    series_key: "gt3open",
                    subsession_id: "83007142",
                    start_time: "2026-02-01T00:00:00Z",
                    track_name: "Suzuka",
                    raw_json: {},
                    race_results: {},
                    fetched_at: "2026-02-03T00:00:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        const rows = await listCnaEventResultsBySeriesSeason({ seriesKey: "gt3open", seasonKey: "26S1", limit: 10 });
        expect(rows[0].eventId).toBe("gt3open:26S1:8");

        const likeCall = calls.find((c) => c.table === "cna_event_results" && c.op === "like");
        expect(likeCall).toBeTruthy();
        expect(likeCall.column).toBe("event_id");
        expect(likeCall.pattern).toBe("gt3open:26S1:%");
    });
});

