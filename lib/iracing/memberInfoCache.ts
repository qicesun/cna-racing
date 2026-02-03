import "server-only";

import { getValidIracingAuthAccessToken } from "@/lib/iracing/tokenStore";
import { fetchIracingMemberInfo, type IracingMemberInfo } from "@/lib/iracing/memberInfo";
import {
    getCnaIracingMemberInfoByCustId,
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

