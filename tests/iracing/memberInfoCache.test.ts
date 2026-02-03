import { describe, expect, it, vi } from "vitest";

const listCnaIracingMemberInfoByCustIds = vi.fn();

vi.mock("@/lib/db/cnaIracingMemberInfo", () => ({
    listCnaIracingMemberInfoByCustIds: (ids: number[]) => listCnaIracingMemberInfoByCustIds(ids),
    getCnaIracingMemberInfoByCustId: vi.fn(),
    upsertCnaIracingMemberInfo: vi.fn(),
}));

import { listCachedIracingSportsCarRatings } from "@/lib/iracing/memberInfoCache";

describe("lib/iracing/memberInfoCache", () => {
    it("bulk-maps cached sports car iR/SR by custId", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:00:00.000Z"));
        try {
            listCnaIracingMemberInfoByCustIds.mockResolvedValueOnce([
                {
                    iracingCustId: 1,
                    data: {
                        custId: 1,
                        displayName: "A",
                        licenses: [
                            { category: "sports_car", categoryId: 5, irating: 2000, safetyRating: 3.5, licenseClass: "B" },
                        ],
                    },
                    fetchedAt: "2026-02-03T00:00:00.000Z",
                    expiresAt: "2026-02-03T00:10:00.000Z",
                },
                {
                    iracingCustId: 2,
                    data: {
                        custId: 2,
                        displayName: "B",
                        licenses: [
                            { category: "oval", categoryId: 1, irating: 1000, safetyRating: 2.0, licenseClass: null },
                        ],
                    },
                    fetchedAt: "2026-02-03T00:00:00.000Z",
                    expiresAt: "2026-02-03T00:10:00.000Z",
                },
            ]);

            const map = await listCachedIracingSportsCarRatings([1, 2]);
            expect(map.get(1)).toMatchObject({ irating: 2000, safetyRating: 3.5, stale: false });
            expect(map.has(2)).toBe(false); // no sports_car license -> omitted
        } finally {
            vi.useRealTimers();
        }
    });
});

