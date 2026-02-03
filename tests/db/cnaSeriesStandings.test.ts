import { describe, expect, it, vi } from "vitest";

type SupabaseResponse = { data?: any; error?: any };

function makeSupabaseClientMock() {
    const calls: any[] = [];
    const responses: Record<string, SupabaseResponse> = {};

    class Builder {
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
            return this;
        }

        limit(n: number) {
            calls.push({ table: this.table, op: "limit", n });
            return Promise.resolve(responses.get ?? { data: [], error: null });
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

import { getCnaSeriesStandings, upsertCnaSeriesStandings } from "@/lib/db/cnaSeriesStandings";

describe("lib/db/cnaSeriesStandings", () => {
    it("upserts standings by (series_key, season_key)", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.upsert = { error: null };
        getSupabaseAdminClient.mockReturnValue(client);

        await upsertCnaSeriesStandings({
            seriesKey: "gt3open",
            seasonKey: "26S1",
            data: { version: 1, standings: [] },
            updatedAt: "2026-02-03T00:00:00.000Z",
        });

        const upsertCall = calls.find((c) => c.table === "cna_series_standings" && c.op === "upsert");
        expect(upsertCall).toBeTruthy();
        expect(upsertCall.payload.series_key).toBe("gt3open");
        expect(upsertCall.payload.season_key).toBe("26S1");
        expect(upsertCall.payload.data).toEqual({ version: 1, standings: [] });
        expect(upsertCall.payload.updated_at).toBe("2026-02-03T00:00:00.000Z");
    });

    it("throws on upsert errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.upsert = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(
            upsertCnaSeriesStandings({
                seriesKey: "gt3open",
                seasonKey: "26S1",
                data: {},
                updatedAt: "t",
            })
        ).rejects.toThrow(/upsert series standings failed/i);
    });

    it("gets standings snapshot by (series_key, season_key)", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    series_key: "gt3open",
                    season_key: "26S1",
                    data: { version: 1, standings: [{ custId: 1 }] },
                    updated_at: "2026-02-03T00:00:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaSeriesStandings({ seriesKey: "gt3open", seasonKey: "26S1" })).resolves.toEqual({
            seriesKey: "gt3open",
            seasonKey: "26S1",
            data: { version: 1, standings: [{ custId: 1 }] },
            updatedAt: "2026-02-03T00:00:00.000Z",
        });
    });

    it("returns null when no standings row exists", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: null, data: [] };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaSeriesStandings({ seriesKey: "gt3open", seasonKey: "26S1" })).resolves.toBeNull();
    });

    it("returns null when standings row is malformed", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: null, data: [{ series_key: "gt3open", season_key: 123, updated_at: "t", data: {} }] };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaSeriesStandings({ seriesKey: "gt3open", seasonKey: "26S1" })).resolves.toBeNull();
    });

    it("throws on get errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaSeriesStandings({ seriesKey: "gt3open", seasonKey: "26S1" })).rejects.toThrow(
            /get series standings failed/i
        );
    });
});
