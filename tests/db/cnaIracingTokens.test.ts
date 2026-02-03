import { describe, expect, it, vi } from "vitest";

type SupabaseResponse = { data?: any; error?: any };

function makeSupabaseClientMock() {
    const calls: any[] = [];
    const responses: Record<string, SupabaseResponse> = {};

    class Builder {
        private mode: "select" | "delete" | null = null;

        constructor(private readonly table: string) {}

        upsert(payload: any, opts: any) {
            calls.push({ table: this.table, op: "upsert", payload, opts });
            return Promise.resolve(responses.upsert ?? { error: null });
        }

        select(selection: string) {
            calls.push({ table: this.table, op: "select", selection });
            this.mode = "select";
            return this;
        }

        delete() {
            calls.push({ table: this.table, op: "delete" });
            this.mode = "delete";
            return this;
        }

        eq(column: string, value: any) {
            calls.push({ table: this.table, op: "eq", column, value });
            if (this.mode === "delete") {
                return Promise.resolve(responses.delete ?? { error: null });
            }
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

import {
    deleteCnaIracingTokensByCustId,
    getCnaIracingTokensByCustId,
    upsertCnaIracingTokens,
} from "@/lib/db/cnaIracingTokens";

describe("lib/db/cnaIracingTokens", () => {
    it("upserts tokens with updated_at", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:00:00.000Z"));
        try {
            const { client, calls, responses } = makeSupabaseClientMock();
            responses.upsert = { error: null };
            getSupabaseAdminClient.mockReturnValue(client);

            await upsertCnaIracingTokens({
                iracingCustId: 15535,
                accessToken: "ACCESS",
                accessExpiresAt: "2026-02-03T00:10:00.000Z",
                refreshTokenEnc: "ENC",
                refreshExpiresAt: "2026-02-04T00:00:00.000Z",
                scope: "iracing.auth",
            });

            const upsertCall = calls.find((c) => c.table === "cna_iracing_tokens" && c.op === "upsert");
            expect(upsertCall).toBeTruthy();
            expect(upsertCall.payload.iracing_cust_id).toBe(15535);
            expect(upsertCall.payload.access_token).toBe("ACCESS");
            expect(upsertCall.payload.refresh_token_enc).toBe("ENC");
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
            upsertCnaIracingTokens({
                iracingCustId: 1,
                accessToken: "ACCESS",
                accessExpiresAt: "t",
                refreshTokenEnc: null,
                refreshExpiresAt: null,
                scope: null,
            })
        ).rejects.toThrow(/upsert iRacing tokens failed/i);
    });

    it("gets tokens by cust id and maps fields", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    iracing_cust_id: "15535",
                    access_token: "ACCESS",
                    access_expires_at: "2026-02-03T00:10:00.000Z",
                    refresh_token_enc: "ENC",
                    refresh_expires_at: "2026-02-04T00:00:00.000Z",
                    scope: "iracing.auth",
                    updated_at: "2026-02-03T00:00:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaIracingTokensByCustId(15535)).resolves.toEqual({
            iracingCustId: 15535,
            accessToken: "ACCESS",
            accessExpiresAt: "2026-02-03T00:10:00.000Z",
            refreshTokenEnc: "ENC",
            refreshExpiresAt: "2026-02-04T00:00:00.000Z",
            scope: "iracing.auth",
            updatedAt: "2026-02-03T00:00:00.000Z",
        });
    });

    it("returns null when get row is malformed", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: null, data: [{ iracing_cust_id: "nope", access_token: null }] };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaIracingTokensByCustId(1)).resolves.toBeNull();
    });

    it("throws on get errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaIracingTokensByCustId(1)).rejects.toThrow(/get iRacing tokens failed/i);
    });

    it("deletes tokens by cust id", async () => {
        const { client, calls, responses } = makeSupabaseClientMock();
        responses.delete = { error: null };
        getSupabaseAdminClient.mockReturnValue(client);

        await deleteCnaIracingTokensByCustId(15535);

        const delCall = calls.find((c) => c.table === "cna_iracing_tokens" && c.op === "delete");
        expect(delCall).toBeTruthy();
        const eqCall = calls.find((c) => c.table === "cna_iracing_tokens" && c.op === "eq");
        expect(eqCall?.column).toBe("iracing_cust_id");
        expect(eqCall?.value).toBe(15535);
    });

    it("throws on delete errors", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.delete = { error: { message: "nope" } };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(deleteCnaIracingTokensByCustId(1)).rejects.toThrow(/delete iRacing tokens failed/i);
    });
});
