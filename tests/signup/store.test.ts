import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/signup/supabaseStore", () => ({
    createSupabaseSignupStore: vi.fn(() => ({
        upsertUser: vi.fn(),
        createSignup: vi.fn(),
        deleteSignup: vi.fn(),
        listSignupsForEvent: vi.fn(),
        listSignupRowsForEvents: vi.fn(),
        listSignupsForUser: vi.fn(),
    })),
}));

import { getSignupStore } from "@/lib/signup/store";
import { createSupabaseSignupStore } from "@/lib/signup/supabaseStore";

describe("lib/signup/store", () => {
    it("caches the store instance", () => {
        const a = getSignupStore();
        const b = getSignupStore();

        expect(a).toBe(b);
        expect(vi.mocked(createSupabaseSignupStore)).toHaveBeenCalledTimes(1);
    });
});

