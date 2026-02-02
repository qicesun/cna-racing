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

import { getCnaUserProfile, upsertCnaUserProfile } from "@/lib/db/cnaUserProfiles";

describe("lib/db/cnaUserProfiles", () => {
    it("returns null when no profile row exists", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = { error: null, data: [] };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaUserProfile(1)).resolves.toBeNull();
    });

    it("maps a stored profile row", async () => {
        const { client, responses } = makeSupabaseClientMock();
        responses.get = {
            error: null,
            data: [
                {
                    iracing_cust_id: 15535,
                    nickname: "Zile",
                    discord: "zile#1234",
                    bio: "hello",
                    preferred_car: "Porsche",
                    car_number: "88",
                    links: [{ label: "Site", url: "https://example.com" }],
                    created_at: "2026-02-02T00:00:00.000Z",
                    updated_at: "2026-02-02T00:00:00.000Z",
                },
            ],
        };
        getSupabaseAdminClient.mockReturnValue(client);

        await expect(getCnaUserProfile(15535)).resolves.toEqual({
            iracingCustId: 15535,
            nickname: "Zile",
            discord: "zile#1234",
            bio: "hello",
            preferredCar: "Porsche",
            carNumber: "88",
            links: [{ label: "Site", url: "https://example.com" }],
            createdAt: "2026-02-02T00:00:00.000Z",
            updatedAt: "2026-02-02T00:00:00.000Z",
        });
    });

    it("upserts profile fields into cna_user_profiles", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-02T00:00:00.000Z"));
        try {
            const { client, calls, responses } = makeSupabaseClientMock();
            responses.upsert = { error: null };
            getSupabaseAdminClient.mockReturnValue(client);

            await upsertCnaUserProfile(15535, {
                nickname: "Zile",
                discord: null,
                bio: null,
                preferredCar: null,
                carNumber: "88",
                links: [{ label: "Site", url: "https://example.com" }],
            });

            const upsertCall = calls.find((c) => c.table === "cna_user_profiles" && c.op === "upsert");
            expect(upsertCall).toBeTruthy();
            expect(upsertCall.payload.iracing_cust_id).toBe(15535);
            expect(upsertCall.payload.nickname).toBe("Zile");
            expect(upsertCall.payload.car_number).toBe("88");
            expect(upsertCall.payload.links).toEqual([{ label: "Site", url: "https://example.com" }]);
            expect(upsertCall.payload.updated_at).toBe("2026-02-02T00:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });
});

