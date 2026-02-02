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

        order(column: string, opts: any) {
            calls.push({ table: this.table, op: "order", column, opts });
            return this;
        }

        limit(n: number) {
            calls.push({ table: this.table, op: "limit", n });
            return Promise.resolve(responses.list ?? { data: [], error: null });
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

import { getCnaUserByCustId, listCnaUsers, upsertCnaUser } from "@/lib/db/cnaUsers";

describe("lib/db/cnaUsers", () => {
    it("upserts a CNA user with updated_at", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-02T00:00:00.000Z"));
        try {
            const { client, calls, responses } = makeSupabaseClientMock();
            responses.upsert = { error: null };
            getSupabaseAdminClient.mockReturnValue(client);

            await upsertCnaUser({ iracingCustId: 15535, iracingName: "John West" });

            const upsertCall = calls.find((c) => c.table === "cna_users" && c.op === "upsert");
            expect(upsertCall).toBeTruthy();
            expect(upsertCall.payload.iracing_cust_id).toBe(15535);
            expect(upsertCall.payload.iracing_name).toBe("John West");
            expect(upsertCall.payload.updated_at).toBe("2026-02-02T00:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });

    it("lists users ordered by updated_at and maps fields", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.list = {
            error: null,
            data: [
                { iracing_cust_id: 1, iracing_name: "A", updated_at: "2026-02-02T00:00:00.000Z" },
                { iracing_cust_id: "2", iracing_name: "B", updated_at: "2026-02-01T00:00:00.000Z" },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        const users = await listCnaUsers(123);
        expect(users).toEqual([
            { iracingCustId: 1, iracingName: "A", updatedAt: "2026-02-02T00:00:00.000Z" },
            { iracingCustId: 2, iracingName: "B", updatedAt: "2026-02-01T00:00:00.000Z" },
        ]);

        expect(calls.some((c) => c.table === "cna_users" && c.op === "order")).toBe(true);
        const limitCall = calls.find((c) => c.table === "cna_users" && c.op === "limit");
        expect(limitCall?.n).toBe(123);
    });

    it("gets a single user by cust id", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.list = {
            error: null,
            data: [{ iracing_cust_id: 15535, iracing_name: "John West", updated_at: "2026-02-02T00:00:00.000Z" }],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaUserByCustId(15535)).resolves.toEqual({
            iracingCustId: 15535,
            iracingName: "John West",
            updatedAt: "2026-02-02T00:00:00.000Z",
        });

        const eqCall = calls.find((c) => c.table === "cna_users" && c.op === "eq");
        expect(eqCall).toBeTruthy();
        expect(eqCall.column).toBe("iracing_cust_id");
        expect(eqCall.value).toBe(15535);
    });
});
