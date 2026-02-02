import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";
import type { EditableUserProfile, ProfileLink } from "@/lib/user/profile";

const PROFILES_TABLE = "cna_user_profiles";

export type CnaUserProfile = EditableUserProfile & {
    iracingCustId: number;
    createdAt: string;
    updatedAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

function parseLinks(value: unknown): ProfileLink[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item: any) => {
            const label = typeof item?.label === "string" ? item.label : null;
            const url = typeof item?.url === "string" ? item.url : null;
            if (!label || !url) return null;
            return { label, url } satisfies ProfileLink;
        })
        .filter((l: ProfileLink | null): l is ProfileLink => l !== null);
}

export async function getCnaUserProfile(iracingCustId: number): Promise<CnaUserProfile | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(PROFILES_TABLE)
        .select("iracing_cust_id, nickname, discord, bio, preferred_car, car_number, links, created_at, updated_at")
        .eq("iracing_cust_id", iracingCustId)
        .limit(1);

    if (error) fail("Supabase get user profile failed", error);

    const row = (data ?? [])[0];
    if (!row) return null;

    const custId = typeof row.iracing_cust_id === "number" ? row.iracing_cust_id : Number(row.iracing_cust_id);
    if (!Number.isFinite(custId)) return null;

    return {
        iracingCustId: custId,
        nickname: typeof row.nickname === "string" ? row.nickname : null,
        discord: typeof row.discord === "string" ? row.discord : null,
        bio: typeof row.bio === "string" ? row.bio : null,
        preferredCar: typeof row.preferred_car === "string" ? row.preferred_car : null,
        carNumber: typeof row.car_number === "string" ? row.car_number : null,
        links: parseLinks(row.links),
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    };
}

export async function upsertCnaUserProfile(iracingCustId: number, profile: EditableUserProfile): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
        .from(PROFILES_TABLE)
        .upsert(
            {
                iracing_cust_id: iracingCustId,
                nickname: profile.nickname,
                discord: profile.discord,
                bio: profile.bio,
                preferred_car: profile.preferredCar,
                car_number: profile.carNumber,
                links: profile.links,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "iracing_cust_id" }
        );

    if (error) fail("Supabase upsert user profile failed", error);
}

