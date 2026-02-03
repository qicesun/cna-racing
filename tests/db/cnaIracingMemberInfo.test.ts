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
            this.mode = "get";
            return this;
        }

        in(column: string, values: any[]) {
            calls.push({ table: this.table, op: "in", column, values });
            this.mode = "list";
            return this;
        }

        limit(n: number) {
            calls.push({ table: this.table, op: "limit", n });
            const key = this.mode ?? "get";
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

import { getCnaIracingMemberInfoByCustId, upsertCnaIracingMemberInfo } from "@/lib/db/cnaIracingMemberInfo";
import { listCnaIracingMemberInfoByCustIds } from "@/lib/db/cnaIracingMemberInfo";

describe("lib/db/cnaIracingMemberInfo", () => {
    it("upserts member info snapshot", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.upsert = { error: null };
        getSupabaseAdminClient.mockReturnValue(client);

        await upsertCnaIracingMemberInfo({
            iracingCustId: 15535,
            data: { hello: "world" },
            fetchedAt: "2026-02-03T00:00:00.000Z",
            expiresAt: "2026-02-03T00:10:00.000Z",
        });

        const upsertCall = calls.find((c) => c.table === "cna_iracing_member_info" && c.op === "upsert");
        expect(upsertCall).toBeTruthy();
        expect(upsertCall.payload.iracing_cust_id).toBe(15535);
        expect(upsertCall.payload.data).toEqual({ hello: "world" });
        expect(upsertCall.payload.fetched_at).toBe("2026-02-03T00:00:00.000Z");
        expect(upsertCall.payload.expires_at).toBe("2026-02-03T00:10:00.000Z");
    });

    it("gets member info snapshot by cust id", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    iracing_cust_id: 15535,
                    data: { hello: "world" },
                    fetched_at: "2026-02-03T00:00:00.000Z",
                    expires_at: "2026-02-03T00:10:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaIracingMemberInfoByCustId(15535)).resolves.toEqual({
            iracingCustId: 15535,
            data: { hello: "world" },
            fetchedAt: "2026-02-03T00:00:00.000Z",
            expiresAt: "2026-02-03T00:10:00.000Z",
        });
    });

    it("lists member info snapshots by cust ids", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.list = {
            error: null,
            data: [
                {
                    iracing_cust_id: 1,
                    data: { custId: 1 },
                    fetched_at: "2026-02-03T00:00:00.000Z",
                    expires_at: "2026-02-03T00:10:00.000Z",
                },
                {
                    iracing_cust_id: "2",
                    data: { custId: 2 },
                    fetched_at: "2026-02-03T00:00:00.000Z",
                    expires_at: "2026-02-03T00:10:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        const rows = await listCnaIracingMemberInfoByCustIds([1, 2, 2]);
        expect(rows).toEqual([
            {
                iracingCustId: 1,
                data: { custId: 1 },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:10:00.000Z",
            },
            {
                iracingCustId: 2,
                data: { custId: 2 },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:10:00.000Z",
            },
        ]);

        const inCall = calls.find((c) => c.table === "cna_iracing_member_info" && c.op === "in");
        expect(inCall).toBeTruthy();
        expect(inCall.column).toBe("iracing_cust_id");
    });
});
