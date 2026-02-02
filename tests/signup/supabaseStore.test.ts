import { beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseResponse = { data?: any; error?: any; count?: number };

function makeSupabaseClientMock() {
    const calls: any[] = [];
    const responses: Record<string, Record<string, SupabaseResponse>> = {
        cna_users: {},
        cna_signups: {},
    };

    class Builder {
        constructor(private readonly table: string) {}

        upsert(payload: any, opts: any) {
            calls.push({ table: this.table, op: "upsert", payload, opts });
            return Promise.resolve(responses[this.table]?.upsert ?? { error: null });
        }

        insert(payload: any) {
            calls.push({ table: this.table, op: "insert", payload });
            return Promise.resolve(responses[this.table]?.insert ?? { error: null });
        }

        delete(opts: any) {
            calls.push({ table: this.table, op: "delete", opts });
            return this;
        }

        match(filter: any) {
            calls.push({ table: this.table, op: "match", filter });
            return Promise.resolve(responses[this.table]?.delete ?? { error: null, count: 0 });
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
            return Promise.resolve(responses[this.table]?.order ?? { data: [], error: null });
        }

        in(column: string, values: any[]) {
            calls.push({ table: this.table, op: "in", column, values });
            return Promise.resolve(responses[this.table]?.in ?? { data: [], error: null });
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

import { createSupabaseSignupStore } from "@/lib/signup/supabaseStore";

describe("lib/signup/supabaseStore", () => {
    beforeEach(() => {
        getSupabaseAdminClient.mockReset();
    });

    it("upserts users into cna_users", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
        try {
            const { client, calls, responses } = makeSupabaseClientMock();
            responses.cna_users.upsert = { error: null };
            getSupabaseAdminClient.mockReturnValue(client);

            const store = createSupabaseSignupStore();
            await store.upsertUser({ iracingCustId: 15535, iracingName: "John West" });

            const upsertCall = calls.find((c) => c.table === "cna_users" && c.op === "upsert");
            expect(upsertCall).toBeTruthy();
            expect(upsertCall.payload.iracing_cust_id).toBe(15535);
            expect(upsertCall.payload.iracing_name).toBe("John West");
            expect(upsertCall.payload.updated_at).toBe("2026-02-01T00:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });

    it("treats unique violations as idempotent signups", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.cna_users.upsert = { error: null };
        responses.cna_signups.insert = { error: { code: "23505", message: "dup" } };
        getSupabaseAdminClient.mockReturnValue(client);

        const store = createSupabaseSignupStore();
        const res = await store.createSignup("gt3open:26S1:1", { iracingCustId: 1, iracingName: "A" });
        expect(res).toEqual({ created: false });
    });

    it("lists signups and maps joined user data", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.cna_signups.order = {
            error: null,
            data: [
                {
                    event_id: "gt3open:26S1:1",
                    iracing_cust_id: 2,
                    created_at: "2026-02-01T00:00:00.000Z",
                    user: { iracing_name: "B" },
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        const store = createSupabaseSignupStore();
        const signups = await store.listSignupsForEvent("gt3open:26S1:1");

        expect(signups).toEqual([
            {
                eventId: "gt3open:26S1:1",
                createdAt: "2026-02-01T00:00:00.000Z",
                user: { iracingCustId: 2, iracingName: "B" },
            },
        ]);
    });

    it("deletes signups and returns deleted flag from count", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.cna_signups.delete = { error: null, count: 1 };
        getSupabaseAdminClient.mockReturnValue(client);

        const store = createSupabaseSignupStore();
        await expect(store.deleteSignup("gt3open:26S1:1", 1)).resolves.toEqual({ deleted: true });
    });
});

