import "server-only";

import { getCurrentUser } from "@/lib/auth/currentUser";
import type { SessionUser } from "@/lib/auth/session";

function parseAdminCustIds(raw: string | undefined): Set<number> {
    const set = new Set<number>();
    for (const part of (raw ?? "").split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const n = Number(trimmed);
        if (Number.isFinite(n) && Number.isInteger(n) && n > 0) set.add(n);
    }
    return set;
}

export function getAdminCustIdAllowList(): Set<number> {
    return parseAdminCustIds(process.env.CNA_ADMIN_CUST_IDS);
}

export function isAdminCustId(custId: number): boolean {
    return getAdminCustIdAllowList().has(custId);
}

export async function getAdminUser(): Promise<SessionUser | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    return isAdminCustId(user.iracingCustId) ? user : null;
}

export async function requireAdminUser(): Promise<SessionUser> {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated.");
    if (!isAdminCustId(user.iracingCustId)) throw new Error("Not authorized.");
    return user;
}

