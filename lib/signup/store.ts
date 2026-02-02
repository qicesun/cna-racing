import "server-only";

import type { Signup, SignupUser } from "./types";
import { createSupabaseSignupStore } from "./supabaseStore";

export type SignupStore = {
    upsertUser(user: SignupUser): Promise<void>;
    createSignup(eventId: string, user: SignupUser): Promise<{ created: boolean }>;
    deleteSignup(eventId: string, iracingCustId: number): Promise<{ deleted: boolean }>;
    listSignupsForEvent(eventId: string): Promise<Signup[]>;
    listSignupRowsForEvents(eventIds: string[]): Promise<Array<{ eventId: string; iracingCustId: number }>>;
    listSignupsForUser(iracingCustId: number): Promise<Array<{ eventId: string; createdAt: string }>>;
};

let cached: SignupStore | null = null;

export function getSignupStore(): SignupStore {
    if (cached) return cached;
    cached = createSupabaseSignupStore();
    return cached;
}

