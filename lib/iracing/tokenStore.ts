import "server-only";

import { refreshIracingToken, type IracingTokenResponse, IracingOAuthError } from "@/lib/auth/iracing";
import { getCnaTokenEncryptionSecret } from "@/lib/auth/secrets";
import { decryptAes256Gcm, encryptAes256Gcm } from "@/lib/crypto/aesgcm";
import {
    deleteCnaIracingTokensByCustId,
    getCnaIracingTokensByCustId,
    upsertCnaIracingTokens,
} from "@/lib/db/cnaIracingTokens";

const ACCESS_TOKEN_SKEW_MS = 30_000;

function toIso(ms: number): string {
    return new Date(ms).toISOString();
}

function parseMs(iso: string | null): number | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}

export function computeExpiryFromNowSeconds(nowMs: number, seconds: number | undefined, fallbackSeconds: number): string {
    const s = typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSeconds;
    return toIso(nowMs + s * 1000);
}

export async function storeIracingAuthTokens(params: {
    iracingCustId: number;
    token: IracingTokenResponse;
    nowMs?: number;
}): Promise<void> {
    const nowMs = params.nowMs ?? Date.now();
    const token = params.token;

    const accessExpiresAt = computeExpiryFromNowSeconds(nowMs, token.expires_in, 10 * 60);

    const refreshTokenEnc = token.refresh_token ? encryptAes256Gcm(token.refresh_token, getCnaTokenEncryptionSecret()) : null;
    const refreshExpiresAt = token.refresh_token ? computeExpiryFromNowSeconds(nowMs, token.refresh_token_expires_in, 24 * 60 * 60) : null;

    await upsertCnaIracingTokens({
        iracingCustId: params.iracingCustId,
        accessToken: token.access_token,
        accessExpiresAt,
        refreshTokenEnc,
        refreshExpiresAt,
        scope: token.scope ?? null,
    });
}

export async function getValidIracingAuthAccessToken(iracingCustId: number): Promise<string | null> {
    const row = await getCnaIracingTokensByCustId(iracingCustId);
    if (!row) return null;

    const now = Date.now();
    const accessExp = parseMs(row.accessExpiresAt);
    if (accessExp !== null && accessExp - ACCESS_TOKEN_SKEW_MS > now) return row.accessToken;

    if (!row.refreshTokenEnc) return null;

    const refreshExp = parseMs(row.refreshExpiresAt);
    if (refreshExp !== null && refreshExp <= now) return null;

    let refreshToken: string;
    try {
        refreshToken = decryptAes256Gcm(row.refreshTokenEnc, getCnaTokenEncryptionSecret());
    } catch {
        // If we can't decrypt, force a re-connect.
        await deleteCnaIracingTokensByCustId(iracingCustId).catch(() => undefined);
        return null;
    }

    try {
        const refreshed = await refreshIracingToken({ refreshToken, scope: "iracing.auth" });
        if (!refreshed.refresh_token) {
            // Refresh tokens are one-time-use; without a replacement we can't safely continue.
            await deleteCnaIracingTokensByCustId(iracingCustId).catch(() => undefined);
            return null;
        }

        await storeIracingAuthTokens({ iracingCustId, token: refreshed });
        return refreshed.access_token;
    } catch (e) {
        if (e instanceof IracingOAuthError) {
            // Discard invalid/expired refresh token and require a fresh authorization.
            await deleteCnaIracingTokensByCustId(iracingCustId).catch(() => undefined);
            return null;
        }
        throw e;
    }
}

