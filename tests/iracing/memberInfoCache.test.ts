import { describe, expect, it, vi } from "vitest";

const getValidIracingAuthAccessToken = vi.fn();
const fetchIracingMemberInfo = vi.fn();

const listCnaIracingMemberInfoByCustIds = vi.fn();
const getCnaIracingMemberInfoByCustId = vi.fn();
const upsertCnaIracingMemberInfo = vi.fn();

vi.mock("@/lib/iracing/tokenStore", () => ({
    getValidIracingAuthAccessToken: (custId: number) => getValidIracingAuthAccessToken(custId),
}));

vi.mock("@/lib/db/cnaIracingMemberInfo", () => ({
    listCnaIracingMemberInfoByCustIds: (ids: number[]) => listCnaIracingMemberInfoByCustIds(ids),
    getCnaIracingMemberInfoByCustId: (custId: number) => getCnaIracingMemberInfoByCustId(custId),
    upsertCnaIracingMemberInfo: (args: any) => upsertCnaIracingMemberInfo(args),
}));

vi.mock("@/lib/iracing/memberInfo", async () => {
    const actual = await vi.importActual<typeof import("@/lib/iracing/memberInfo")>("@/lib/iracing/memberInfo");
    return {
        ...actual,
        fetchIracingMemberInfo: (accessToken: string) => fetchIracingMemberInfo(accessToken),
    };
});

import {
    getCachedIracingMemberInfo,
    getOrRefreshIracingMemberInfo,
    listCachedIracingSportsCarRatings,
    refreshIracingMemberInfo,
} from "@/lib/iracing/memberInfoCache";

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

    it("marks cached rows stale when expiresAt is in the past", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:05:00.000Z"));
        try {
            getCnaIracingMemberInfoByCustId.mockResolvedValueOnce({
                iracingCustId: 1,
                data: { custId: 1, displayName: "A", licenses: [] },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:01:00.000Z",
            });

            const cached = await getCachedIracingMemberInfo(1);
            expect(cached).toMatchObject({ stale: true, fetchedAt: "2026-02-03T00:00:00.000Z" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("refreshIracingMemberInfo returns null when no auth token exists", async () => {
        getValidIracingAuthAccessToken.mockResolvedValueOnce(null);
        await expect(refreshIracingMemberInfo(1)).resolves.toBeNull();
    });

    it("refreshIracingMemberInfo fetches member info and upserts cache", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:00:00.000Z"));
        try {
            getValidIracingAuthAccessToken.mockResolvedValueOnce("token");
            fetchIracingMemberInfo.mockResolvedValueOnce({
                custId: 1,
                displayName: "A",
                licenses: [{ category: "sports_car", categoryId: 5, licenseClass: "B", irating: 2000, safetyRating: 3.5 }],
            });
            upsertCnaIracingMemberInfo.mockResolvedValueOnce(undefined);

            const refreshed = await refreshIracingMemberInfo(1);
            expect(refreshed).toBeTruthy();
            expect(refreshed?.stale).toBe(false);
            expect(refreshed?.fetchedAt).toBe("2026-02-03T00:00:00.000Z");
            expect(refreshed?.expiresAt).toBe("2026-02-03T00:10:00.000Z");

            expect(upsertCnaIracingMemberInfo).toHaveBeenCalledWith({
                iracingCustId: 1,
                data: expect.any(Object),
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:10:00.000Z",
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("getOrRefresh returns fresh cache when not stale (does not refresh)", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:01:00.000Z"));
        try {
            getCnaIracingMemberInfoByCustId.mockResolvedValueOnce({
                iracingCustId: 1,
                data: { custId: 1, displayName: "A", licenses: [] },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:10:00.000Z",
            });

            const res = await getOrRefreshIracingMemberInfo(1);
            expect(res?.stale).toBe(false);
            expect(getValidIracingAuthAccessToken).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("getOrRefresh returns cached value when refresh disabled", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:05:00.000Z"));
        try {
            getCnaIracingMemberInfoByCustId.mockResolvedValueOnce({
                iracingCustId: 1,
                data: { custId: 1, displayName: "A", licenses: [] },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:01:00.000Z",
            });

            const res = await getOrRefreshIracingMemberInfo(1, { refresh: false });
            expect(res?.stale).toBe(true);
            expect(getValidIracingAuthAccessToken).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("getOrRefresh falls back to cached when refresh throws", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:05:00.000Z"));
        try {
            getCnaIracingMemberInfoByCustId.mockResolvedValueOnce({
                iracingCustId: 1,
                data: { custId: 1, displayName: "A", licenses: [] },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:01:00.000Z",
            });

            getValidIracingAuthAccessToken.mockResolvedValueOnce("token");
            fetchIracingMemberInfo.mockRejectedValueOnce(new Error("boom"));

            const res = await getOrRefreshIracingMemberInfo(1, { refresh: true });
            expect(res?.fetchedAt).toBe("2026-02-03T00:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });

    it("getOrRefresh returns cached value when refresh returns null", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:05:00.000Z"));
        try {
            getCnaIracingMemberInfoByCustId.mockResolvedValueOnce({
                iracingCustId: 1,
                data: { custId: 1, displayName: "A", licenses: [] },
                fetchedAt: "2026-02-03T00:00:00.000Z",
                expiresAt: "2026-02-03T00:01:00.000Z",
            });

            getValidIracingAuthAccessToken.mockResolvedValueOnce(null); // refreshIracingMemberInfo -> null

            const res = await getOrRefreshIracingMemberInfo(1, { refresh: true });
            expect(res?.fetchedAt).toBe("2026-02-03T00:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });

    it("getOrRefresh returns null when no cache exists and refresh returns null", async () => {
        getCnaIracingMemberInfoByCustId.mockResolvedValueOnce(null);
        getValidIracingAuthAccessToken.mockResolvedValueOnce(null);

        await expect(getOrRefreshIracingMemberInfo(1, { refresh: true })).resolves.toBeNull();
    });
});
