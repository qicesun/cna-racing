import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

import type { Signup, SignupUser } from "./types";
import type { SignupStore } from "./store";

const USERS_TABLE = "cna_users";
const SIGNUPS_TABLE = "cna_signups";

function fail(context: string, error: unknown): never {
    const msg = error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export function createSupabaseSignupStore(): SignupStore {
    const supabase = getSupabaseAdminClient();

    return {
        async upsertUser(user: SignupUser) {
            const { error } = await supabase
                .from(USERS_TABLE)
                .upsert(
                    {
                        iracing_cust_id: user.iracingCustId,
                        iracing_name: user.iracingName,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "iracing_cust_id" }
                );

            if (error) fail("Supabase upsert user failed", error);
        },

        async createSignup(eventId: string, user: SignupUser) {
            await this.upsertUser(user);

            const { error } = await supabase.from(SIGNUPS_TABLE).insert({
                event_id: eventId,
                iracing_cust_id: user.iracingCustId,
            });

            if (!error) return { created: true };

            // Unique violation = already signed up.
            const code = (error as any)?.code;
            if (code === "23505") return { created: false };

            fail("Supabase create signup failed", error);
        },

        async deleteSignup(eventId: string, iracingCustId: number) {
            const { error, count } = await supabase
                .from(SIGNUPS_TABLE)
                .delete({ count: "exact" })
                .match({ event_id: eventId, iracing_cust_id: iracingCustId });

            if (error) fail("Supabase delete signup failed", error);
            return { deleted: (count ?? 0) > 0 };
        },

        async listSignupsForEvent(eventId: string): Promise<Signup[]> {
            const { data, error } = await supabase
                .from(SIGNUPS_TABLE)
                .select("event_id, iracing_cust_id, created_at, user:cna_users(iracing_name)")
                .eq("event_id", eventId)
                .order("created_at", { ascending: true });

            if (error) fail("Supabase list signups failed", error);

            return (data ?? [])
                .map((row: any) => {
                    const custId =
                        typeof row.iracing_cust_id === "number"
                            ? row.iracing_cust_id
                            : Number(row.iracing_cust_id);
                    const name = typeof row.user?.iracing_name === "string" ? row.user.iracing_name : null;
                    if (!Number.isFinite(custId) || !name) return null;
                    return {
                        eventId: row.event_id,
                        createdAt: row.created_at,
                        user: { iracingCustId: custId, iracingName: name },
                    } satisfies Signup;
                })
                .filter((s: Signup | null): s is Signup => s !== null);
        },

        async listSignupRowsForEvents(eventIds: string[]): Promise<Array<{ eventId: string; iracingCustId: number }>> {
            if (eventIds.length === 0) return [];

            const { data, error } = await supabase
                .from(SIGNUPS_TABLE)
                .select("event_id, iracing_cust_id")
                .in("event_id", eventIds);

            if (error) fail("Supabase list signup rows failed", error);

            return (data ?? []).map((row: any) => ({
                eventId: row.event_id,
                iracingCustId: row.iracing_cust_id,
            }));
        },

        async listSignupsForUser(iracingCustId: number): Promise<Array<{ eventId: string; createdAt: string }>> {
            const { data, error } = await supabase
                .from(SIGNUPS_TABLE)
                .select("event_id, created_at")
                .eq("iracing_cust_id", iracingCustId)
                .order("created_at", { ascending: false });

            if (error) fail("Supabase list user signups failed", error);

            return (data ?? []).map((row: any) => ({
                eventId: row.event_id,
                createdAt: row.created_at,
            }));
        },
    };
}
