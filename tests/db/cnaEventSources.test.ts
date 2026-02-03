import { describe, expect, it, vi } from "vitest";

type SupabaseResponse = { data?: any; error?: any };

function makeSupabaseClientMock() {
    const calls: any[] = [];
    const responses: Record<string, SupabaseResponse> = {};

    class Builder {
        private mode: "get" | "list" | "delete" | null = null;

        constructor(private readonly table: string) {}

        upsert(payload: any, opts: any) {
            calls.push({ table: this.table, op: "upsert", payload, opts });
            return Promise.resolve(responses.upsert ?? { error: null });
        }

        delete() {
            calls.push({ table: this.table, op: "delete" });
            this.mode = "delete";
            return this;
        }

        select(selection: string) {
            calls.push({ table: this.table, op: "select", selection });
            return this;
        }

        eq(column: string, value: any) {
            calls.push({ table: this.table, op: "eq", column, value });
            if (this.mode !== "delete") this.mode = "get";
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
    deleteCnaEventSourceByEventId,
    getCnaEventSourceByEventId,
    listCnaEventSources,
    upsertCnaEventSource,
} from "@/lib/db/cnaEventSources";

describe("lib/db/cnaEventSources", () => {
    it("upserts event source by event_id", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:00:00.000Z"));
        try {
            const { client, calls, responses } = makeSupabaseClientMock();
            responses.upsert = { error: null };
            getSupabaseAdminClient.mockReturnValue(client);

            await upsertCnaEventSource({
                eventId: "gt3open:26S1:8",
                seriesKey: "gt3open",
                subsessionId: 83007142,
                createdBy: 1127717,
            });

            const upsertCall = calls.find((c) => c.table === "cna_event_sources" && c.op === "upsert");
            expect(upsertCall).toBeTruthy();
            expect(upsertCall.payload.event_id).toBe("gt3open:26S1:8");
            expect(upsertCall.payload.series_key).toBe("gt3open");
            expect(upsertCall.payload.subsession_id).toBe(83007142);
            expect(upsertCall.payload.created_by).toBe(1127717);
            expect(upsertCall.payload.updated_at).toBe("2026-02-03T00:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });

    it("throws on upsert errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.upsert = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(
            upsertCnaEventSource({
                eventId: "gt3open:26S1:8",
                seriesKey: "gt3open",
                subsessionId: 83007142,
                createdBy: 1127717,
            })
        ).rejects.toThrow(/upsert event source failed/i);
    });

    it("gets event source by event_id", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    event_id: "gt3open:26S1:8",
                    series_key: "gt3open",
                    subsession_id: 83007142,
                    created_by: 1127717,
                    created_at: "x",
                    updated_at: "y",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaEventSourceByEventId("gt3open:26S1:8")).resolves.toEqual({
            eventId: "gt3open:26S1:8",
            seriesKey: "gt3open",
            subsessionId: 83007142,
            createdBy: 1127717,
            createdAt: "x",
            updatedAt: "y",
        });
    });

    it("returns null when get row is malformed", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    event_id: "gt3open:26S1:8",
                    series_key: "gt3open",
                    subsession_id: "nope",
                    created_by: null,
                    created_at: "x",
                    updated_at: "y",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaEventSourceByEventId("gt3open:26S1:8")).resolves.toBeNull();
    });

    it("throws on get errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaEventSourceByEventId("gt3open:26S1:8")).rejects.toThrow(/get event source failed/i);
    });

    it("lists event sources ordered by updated_at", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.list = {
            error: null,
            data: [
                {
                    event_id: "gt3open:26S1:9",
                    series_key: "gt3open",
                    subsession_id: "83007143",
                    created_by: null,
                    created_at: "x",
                    updated_at: "y",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        const rows = await listCnaEventSources(99);
        expect(rows).toEqual([
            {
                eventId: "gt3open:26S1:9",
                seriesKey: "gt3open",
                subsessionId: 83007143,
                createdBy: null,
                createdAt: "x",
                updatedAt: "y",
            },
        ]);

        const orderCall = calls.find((c) => c.table === "cna_event_sources" && c.op === "order");
        expect(orderCall).toBeTruthy();
    });

    it("filters invalid rows in list", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.list = {
            error: null,
            data: [
                { event_id: "gt3open:26S1:9", series_key: "gt3open", subsession_id: 1, created_by: null, created_at: "x", updated_at: "y" },
                { event_id: null, series_key: "gt3open", subsession_id: 2, created_by: null, created_at: "x", updated_at: "y" },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        const rows = await listCnaEventSources(10);
        expect(rows.length).toBe(1);
        expect(rows[0].eventId).toBe("gt3open:26S1:9");
    });

    it("throws on list errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.list = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(listCnaEventSources(10)).rejects.toThrow(/list event sources failed/i);
    });

    it("deletes event source by event_id", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.delete = { error: null, data: [{ event_id: "gt3open:26S1:8" }] };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(deleteCnaEventSourceByEventId("gt3open:26S1:8")).resolves.toBe(true);

        const deleteCall = calls.find((c) => c.table === "cna_event_sources" && c.op === "delete");
        expect(deleteCall).toBeTruthy();
    });

    it("returns false when delete does not match any row", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.delete = { error: null, data: [] };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(deleteCnaEventSourceByEventId("gt3open:26S1:404")).resolves.toBe(false);
    });

    it("throws on delete errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.delete = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(deleteCnaEventSourceByEventId("gt3open:26S1:8")).rejects.toThrow(/delete event source failed/i);
    });
});
