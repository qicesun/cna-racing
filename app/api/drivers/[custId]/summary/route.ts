import { NextResponse } from "next/server";

import { getCnaUserByCustId } from "@/lib/db/cnaUsers";
import { getCnaUserProfile } from "@/lib/db/cnaUserProfiles";
import { getDriverStatsFromResultsByCustId } from "@/lib/drivers/stats";
import { getCachedIracingMemberInfo } from "@/lib/iracing/memberInfoCache";
import { selectSportsCarLicense } from "@/lib/iracing/memberInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, errorDescription: string) {
    return NextResponse.json({ error, error_description: errorDescription }, { status });
}

function toPositiveInt(value: string | undefined): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
}

export type DriverSummaryResponse = {
    custId: number;
    displayName: string;
    iracingName: string | null;
    lastLoginAt: string | null;
    profile: {
        nickname: string | null;
        discord: string | null;
        preferredCar: string | null;
        carNumber: string | null;
    } | null;
    cna: {
        points: number;
        starts: number;
        wins: number;
        podiums: number;
        series: Array<{
            seriesKey: string;
            seasonKey: string;
            points: number;
            starts: number;
            wins: number;
            podiums: number;
            updatedAt: string | null;
        }>;
    } | null;
    iracing: {
        irating: number | null;
        safetyRating: number | null;
        fetchedAt: string | null;
        expiresAt: string | null;
        stale: boolean;
    } | null;
};

export async function GET(
    _request: Request,
    context: { params: { custId: string } | Promise<{ custId: string }> }
) {
    const rawCustId = (await Promise.resolve(context.params)).custId;
    const custId = toPositiveInt(rawCustId);
    if (!custId) return jsonError(400, "invalid_request", "Invalid custId (expected positive integer).");

    const [cnaUser, profile, stats, cachedMemberInfo] = await Promise.all([
        getCnaUserByCustId(custId).catch(() => null),
        getCnaUserProfile(custId).catch(() => null),
        getDriverStatsFromResultsByCustId(custId).catch(() => null),
        getCachedIracingMemberInfo(custId).catch(() => null),
    ]);

    const iracingName = cnaUser?.iracingName ?? stats?.name ?? null;
    const displayName = profile?.nickname ?? iracingName ?? "Driver";

    const hasAnyData = Boolean(profile || cnaUser || stats || cachedMemberInfo);
    if (!hasAnyData) return jsonError(404, "not_found", "Driver not found.");

    const sportsCar = cachedMemberInfo ? selectSportsCarLicense(cachedMemberInfo.info.licenses) : null;

    const body: DriverSummaryResponse = {
        custId,
        displayName,
        iracingName,
        lastLoginAt: cnaUser?.updatedAt ?? null,
        profile: profile
            ? {
                nickname: profile.nickname ?? null,
                discord: profile.discord ?? null,
                preferredCar: profile.preferredCar ?? null,
                carNumber: profile.carNumber ?? null,
            }
            : null,
        cna: stats
            ? {
                points: stats.points,
                starts: stats.starts,
                wins: stats.wins,
                podiums: stats.podiums,
                series: stats.seriesSeasons.map((s) => ({
                    seriesKey: s.seriesKey,
                    seasonKey: s.seasonKey,
                    points: s.points,
                    starts: s.starts,
                    wins: s.wins,
                    podiums: s.podiums,
                    updatedAt: s.updatedAt,
                })),
            }
            : null,
        iracing:
            cachedMemberInfo && sportsCar
                ? {
                    irating: sportsCar.irating ?? null,
                    safetyRating: sportsCar.safetyRating ?? null,
                    fetchedAt: cachedMemberInfo.fetchedAt ?? null,
                    expiresAt: cachedMemberInfo.expiresAt ?? null,
                    stale: cachedMemberInfo.stale,
                }
                : null,
    };

    return NextResponse.json(body, {
        headers: {
            // Keep this inexpensive to refresh; iRacing data itself is cached in DB with TTL.
            "Cache-Control": "public, max-age=0, s-maxage=60",
        },
    });
}
