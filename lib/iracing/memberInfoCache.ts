import "server-only";

import { getValidIracingAuthAccessToken } from "@/lib/iracing/tokenStore";
import {
    fetchIracingMemberInfo,
    normalizeIracingMemberInfo,
    selectSportsCarLicense,
    type IracingMemberInfo,
} from "@/lib/iracing/memberInfo";
import {
    getCnaIracingMemberInfoByCustId,
    listCnaIracingMemberInfoByCustIds,
    upsertCnaIracingMemberInfo,
} from "@/lib/db/cnaIracingMemberInfo";

const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes

function parseMs(iso: string): number | null {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}

function toIso(ms: number): string {
    return new Date(ms).toISOString();
}

export type IracingMemberInfoCacheResult = {
    info: IracingMemberInfo;
    fetchedAt: string;
    expiresAt: string;
    stale: boolean;
};

export type IracingSportsCarRating = {
    irating: number | null;
    safetyRating: number | null;
    fetchedAt: string;
    expiresAt: string;
    stale: boolean;
};

export async function getCachedIracingMemberInfo(iracingCustId: number): Promise<IracingMemberInfoCacheResult | null> {
    const row = await getCnaIracingMemberInfoByCustId(iracingCustId);
    if (!row) return null;

    const info = row.data as IracingMemberInfo;
    const expiresMs = parseMs(row.expiresAt);
    const stale = expiresMs === null ? true : expiresMs <= Date.now();

    return { info, fetchedAt: row.fetchedAt, expiresAt: row.expiresAt, stale };
}

export async function refreshIracingMemberInfo(iracingCustId: number): Promise<IracingMemberInfoCacheResult | null> {
    const accessToken = await getValidIracingAuthAccessToken(iracingCustId);
    if (!accessToken) return null;

    const info = await fetchIracingMemberInfo(accessToken);
    const now = Date.now();
    const fetchedAt = toIso(now);
    const expiresAt = toIso(now + DEFAULT_TTL_SECONDS * 1000);

    await upsertCnaIracingMemberInfo({
        iracingCustId,
        data: info,
        fetchedAt,
        expiresAt,
    });

    return { info, fetchedAt, expiresAt, stale: false };
}

export async function getOrRefreshIracingMemberInfo(
    iracingCustId: number,
    opts?: { refresh?: boolean }
): Promise<IracingMemberInfoCacheResult | null> {
    const cached = await getCachedIracingMemberInfo(iracingCustId);
    const shouldRefresh = opts?.refresh ?? true;

    if (cached && !cached.stale) return cached;
    if (!shouldRefresh) return cached;

    try {
        const refreshed = await refreshIracingMemberInfo(iracingCustId);
        return refreshed ?? cached;
    } catch {
        return cached;
    }
}

// Bulk-read cached iRacing Sports Car iRating/SR without triggering refreshes.
// Used by list pages (e.g. /drivers) to avoid N refreshes per request.
export async function listCachedIracingSportsCarRatings(
    iracingCustIds: number[]
): Promise<Map<number, IracingSportsCarRating>> {
    const rows = await listCnaIracingMemberInfoByCustIds(iracingCustIds);
    const out = new Map<number, IracingSportsCarRating>();

    for (const row of rows) {
        const info = normalizeIracingMemberInfo(row.data);
        if (!info) continue;

        const license = selectSportsCarLicense(info.licenses);
        if (!license) continue;

        const expiresMs = parseMs(row.expiresAt);
        const stale = expiresMs === null ? true : expiresMs <= Date.now();

        out.set(info.custId, {
            irating: license.irating ?? null,
            safetyRating: license.safetyRating ?? null,
            fetchedAt: row.fetchedAt,
            expiresAt: row.expiresAt,
            stale,
        });
    }

    return out;
}
