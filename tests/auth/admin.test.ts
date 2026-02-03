import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/currentUser", () => ({
    getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/currentUser";
import { getAdminCustIdAllowList, getAdminUser, isAdminCustId, requireAdminUser } from "@/lib/auth/admin";

describe("lib/auth/admin", () => {
    it("parses CNA_ADMIN_CUST_IDS allowlist safely", () => {
        vi.stubEnv("CNA_ADMIN_CUST_IDS", "1127717, abc, 0, -1, 1265296, 1127717");

        const set = getAdminCustIdAllowList();
        expect(set.has(1127717)).toBe(true);
        expect(set.has(1265296)).toBe(true);
        expect(set.has(0)).toBe(false);
        expect(set.has(-1)).toBe(false);
    });

    it("isAdminCustId checks membership", () => {
        vi.stubEnv("CNA_ADMIN_CUST_IDS", "1127717");
        expect(isAdminCustId(1127717)).toBe(true);
        expect(isAdminCustId(1265296)).toBe(false);
    });

    it("getAdminUser returns null for non-admins", async () => {
        vi.stubEnv("CNA_ADMIN_CUST_IDS", "1127717");
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 1, iracingName: "A" });
        await expect(getAdminUser()).resolves.toBeNull();
    });

    it("requireAdminUser throws when not authenticated", async () => {
        vi.stubEnv("CNA_ADMIN_CUST_IDS", "1127717");
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
        await expect(requireAdminUser()).rejects.toThrow(/Not authenticated/);
    });

    it("requireAdminUser throws when not authorized", async () => {
        vi.stubEnv("CNA_ADMIN_CUST_IDS", "1127717");
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 1, iracingName: "A" });
        await expect(requireAdminUser()).rejects.toThrow(/Not authorized/);
    });

    it("requireAdminUser returns the session user for admins", async () => {
        vi.stubEnv("CNA_ADMIN_CUST_IDS", "1127717");
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        await expect(requireAdminUser()).resolves.toEqual({ iracingCustId: 1127717, iracingName: "Admin" });
    });
});

