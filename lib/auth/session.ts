import "server-only";

import { getCnaSessionSecret } from "./secrets";
import { createSignedValue, readSignedValue } from "./signed";
import type { SessionUser } from "./types";

export type { SessionUser } from "./types";

type SessionDataV1 = {
    v: 1;
    iat: number;
    exp: number;
    user: SessionUser;
};

export const SESSION_COOKIE_NAME = "cna_session";
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function createSessionCookieValue(
    user: SessionUser,
    options?: { maxAgeSeconds?: number }
): string {
    const maxAgeSeconds = options?.maxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
    const now = Date.now();

    const payload: SessionDataV1 = {
        v: 1,
        iat: now,
        exp: now + maxAgeSeconds * 1000,
        user,
    };

    return createSignedValue(payload, getCnaSessionSecret());
}

export function readSessionCookieValue(cookieValue: string | undefined): SessionDataV1 | null {
    const data = readSignedValue<SessionDataV1>(cookieValue, getCnaSessionSecret());
    if (!data || data.v !== 1 || !data.user) return null;
    if (!Number.isFinite(data.exp)) return null;
    if (Date.now() > data.exp) return null;
    if (typeof data.user.iracingCustId !== "number" || !Number.isFinite(data.user.iracingCustId)) {
        return null;
    }
    if (typeof data.user.iracingName !== "string" || data.user.iracingName.length === 0) {
        return null;
    }
    return data;
}
