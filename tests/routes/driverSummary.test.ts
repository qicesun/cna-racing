import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cnaUsers", () => ({
    getCnaUserByCustId: vi.fn(),
}));

vi.mock("@/lib/db/cnaUserProfiles", () => ({
    getCnaUserProfile: vi.fn(),
}));

vi.mock("@/lib/drivers/stats", () => ({
    getDriverStatsFromResultsByCustId: vi.fn(),
}));

vi.mock("@/lib/iracing/memberInfoCache", () => ({
    getCachedIracingMemberInfo: vi.fn(),
}));

vi.mock("@/lib/iracing/memberInfo", () => ({
    selectSportsCarLicense: vi.fn(),
}));

import { GET } from "@/app/api/drivers/[custId]/summary/route";
import { getCnaUserByCustId } from "@/lib/db/cnaUsers";
import { getCnaUserProfile } from "@/lib/db/cnaUserProfiles";
import { getDriverStatsFromResultsByCustId } from "@/lib/drivers/stats";
import { getCachedIracingMemberInfo } from "@/lib/iracing/memberInfoCache";
import { selectSportsCarLicense } from "@/lib/iracing/memberInfo";

describe("app/api/drivers/[custId]/summary route", () => {
    it("returns 400 on invalid custId", async () => {
        const res = await GET({} as any, { params: { custId: "nope" } });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_request");
    });

    it("returns 404 when no data is found anywhere", async () => {
        vi.mocked(getCnaUserByCustId).mockResolvedValueOnce(null);
        vi.mocked(getCnaUserProfile).mockResolvedValueOnce(null);
        vi.mocked(getDriverStatsFromResultsByCustId).mockResolvedValueOnce(null);
        vi.mocked(getCachedIracingMemberInfo).mockResolvedValueOnce(null);

        const res = await GET({} as any, { params: { custId: "123" } });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("not_found");
    });

    it("prefers profile nickname as displayName", async () => {
        vi.mocked(getCnaUserByCustId).mockResolvedValueOnce({ iracingCustId: 123, iracingName: "IR Name", updatedAt: "t" } as any);
        vi.mocked(getCnaUserProfile).mockResolvedValueOnce({ nickname: "Nick", discord: null, preferredCar: null, carNumber: null } as any);
        vi.mocked(getDriverStatsFromResultsByCustId).mockResolvedValueOnce(null);
        vi.mocked(getCachedIracingMemberInfo).mockResolvedValueOnce(null);

        const res = await GET({} as any, { params: { custId: "123" } });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.displayName).toBe("Nick");
        expect(body.iracingName).toBe("IR Name");
    });

    it("uses stats when available", async () => {
        vi.mocked(getCnaUserByCustId).mockResolvedValueOnce(null);
        vi.mocked(getCnaUserProfile).mockResolvedValueOnce(null);
        vi.mocked(getDriverStatsFromResultsByCustId).mockResolvedValueOnce({
            name: "DB Name",
            points: 100,
            starts: 3,
            wins: 1,
            podiums: 2,
            seriesSeasons: [{ seriesKey: "gt3open", seasonKey: "26S1", points: 100, starts: 3, wins: 1, podiums: 2, updatedAt: "now" }],
        } as any);
        vi.mocked(getCachedIracingMemberInfo).mockResolvedValueOnce(null);

        const res = await GET({} as any, { params: { custId: "123" } });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.cna.points).toBe(100);
        expect(body.cna.starts).toBe(3);
        expect(body.displayName).toBe("DB Name");
    });

    it("includes cached iRacing sports car iR/SR when present", async () => {
        vi.mocked(getCnaUserByCustId).mockResolvedValueOnce(null);
        vi.mocked(getCnaUserProfile).mockResolvedValueOnce(null);
        vi.mocked(getDriverStatsFromResultsByCustId).mockResolvedValueOnce({ name: "Public", points: 0, starts: 0, wins: 0, podiums: 0, seriesSeasons: [] } as any);
        vi.mocked(getCachedIracingMemberInfo).mockResolvedValueOnce({
            info: { custId: 123, licenses: [{ category: "sports_car", irating: 1111, safetyRating: 2.5 }] },
            fetchedAt: "f",
            expiresAt: "e",
            stale: false,
        } as any);
        vi.mocked(selectSportsCarLicense).mockReturnValueOnce({ irating: 1111, safetyRating: 2.5, licenseClass: null } as any);

        const res = await GET({} as any, { params: { custId: "123" } });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.iracing.irating).toBe(1111);
        expect(body.iracing.safetyRating).toBe(2.5);
    });
});
