import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/iracing", async () => {
    const actual = await vi.importActual<any>("@/lib/auth/iracing");
    return {
        ...actual,
        refreshIracingToken: vi.fn(),
    };
});

const getCnaIracingTokensByCustId = vi.fn();
const upsertCnaIracingTokens = vi.fn();
const deleteCnaIracingTokensByCustId = vi.fn();

vi.mock("@/lib/db/cnaIracingTokens", () => ({
    getCnaIracingTokensByCustId: (custId: number) => getCnaIracingTokensByCustId(custId),
    upsertCnaIracingTokens: (params: any) => upsertCnaIracingTokens(params),
    deleteCnaIracingTokensByCustId: (custId: number) => deleteCnaIracingTokensByCustId(custId),
}));

import { refreshIracingToken, IracingOAuthError } from "@/lib/auth/iracing";
import { decryptAes256Gcm, encryptAes256Gcm } from "@/lib/crypto/aesgcm";
import { getValidIracingAuthAccessToken, storeIracingAuthTokens } from "@/lib/iracing/tokenStore";
import { getCnaTokenEncryptionSecret } from "@/lib/auth/secrets";

describe("lib/iracing/tokenStore", () => {
    it("stores encrypted refresh token and computed expiries", async () => {
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        process.env.CNA_TOKEN_ENC_SECRET = "t".repeat(40);

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-03T00:00:00.000Z"));
        try {
            upsertCnaIracingTokens.mockResolvedValueOnce(undefined);

            await storeIracingAuthTokens({
                iracingCustId: 15535,
                token: {
                    access_token: "ACCESS",
                    refresh_token: "REFRESH",
                    expires_in: 60,
                    refresh_token_expires_in: 3600,
                    scope: "iracing.auth",
                },
                nowMs: Date.now(),
            });

            expect(upsertCnaIracingTokens).toHaveBeenCalledTimes(1);
            const call = upsertCnaIracingTokens.mock.calls[0][0];
            expect(call.iracingCustId).toBe(15535);
            expect(call.accessToken).toBe("ACCESS");
            expect(call.scope).toBe("iracing.auth");
            expect(typeof call.refreshTokenEnc).toBe("string");

            const dec = decryptAes256Gcm(call.refreshTokenEnc, getCnaTokenEncryptionSecret());
            expect(dec).toBe("REFRESH");
        } finally {
            vi.useRealTimers();
        }
    });

    it("returns the cached access token when it is not expired", async () => {
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        process.env.CNA_TOKEN_ENC_SECRET = "t".repeat(40);

        getCnaIracingTokensByCustId.mockResolvedValueOnce({
            iracingCustId: 1,
            accessToken: "ACCESS",
            accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            refreshTokenEnc: "enc",
            refreshExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            scope: "iracing.auth",
            updatedAt: new Date().toISOString(),
        });

        await expect(getValidIracingAuthAccessToken(1)).resolves.toBe("ACCESS");
        expect(vi.mocked(refreshIracingToken)).not.toHaveBeenCalled();
    });

    it("refreshes when access token is expired and persists new tokens", async () => {
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        process.env.CNA_TOKEN_ENC_SECRET = "t".repeat(40);

        // Encrypt with the same secret that the store will use.
        const refreshEnc = encryptAes256Gcm("REFRESH_1", getCnaTokenEncryptionSecret());

        getCnaIracingTokensByCustId.mockResolvedValueOnce({
            iracingCustId: 1,
            accessToken: "ACCESS_1",
            accessExpiresAt: new Date(Date.now() - 1_000).toISOString(),
            refreshTokenEnc: refreshEnc,
            refreshExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            scope: "iracing.auth",
            updatedAt: new Date().toISOString(),
        });

        vi.mocked(refreshIracingToken).mockResolvedValueOnce({
            access_token: "ACCESS_2",
            refresh_token: "REFRESH_2",
            expires_in: 60,
            refresh_token_expires_in: 3600,
            scope: "iracing.auth",
        });

        upsertCnaIracingTokens.mockResolvedValue(undefined);

        const access = await getValidIracingAuthAccessToken(1);
        expect(access).toBe("ACCESS_2");
        expect(vi.mocked(refreshIracingToken)).toHaveBeenCalledTimes(1);
        expect(upsertCnaIracingTokens).toHaveBeenCalled();

        const call = upsertCnaIracingTokens.mock.calls.at(-1)![0];
        const dec = decryptAes256Gcm(call.refreshTokenEnc, getCnaTokenEncryptionSecret());
        expect(dec).toBe("REFRESH_2");
    });

    it("deletes tokens and returns null when refresh is rejected", async () => {
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        process.env.CNA_TOKEN_ENC_SECRET = "t".repeat(40);

        const refreshEnc = encryptAes256Gcm("REFRESH_1", getCnaTokenEncryptionSecret());

        getCnaIracingTokensByCustId.mockResolvedValueOnce({
            iracingCustId: 1,
            accessToken: "ACCESS_1",
            accessExpiresAt: new Date(Date.now() - 1_000).toISOString(),
            refreshTokenEnc: refreshEnc,
            refreshExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            scope: "iracing.auth",
            updatedAt: new Date().toISOString(),
        });

        vi.mocked(refreshIracingToken).mockRejectedValueOnce(new IracingOAuthError("invalid_grant", "bad refresh"));
        deleteCnaIracingTokensByCustId.mockResolvedValueOnce(undefined);

        await expect(getValidIracingAuthAccessToken(1)).resolves.toBeNull();
        expect(deleteCnaIracingTokensByCustId).toHaveBeenCalledWith(1);
    });

    it("does not delete tokens when refresh fails but another request already rotated them", async () => {
        process.env.CNA_SESSION_SECRET = "s".repeat(40);
        process.env.CNA_TOKEN_ENC_SECRET = "t".repeat(40);

        const refreshEnc1 = encryptAes256Gcm("REFRESH_1", getCnaTokenEncryptionSecret());
        const refreshEnc2 = encryptAes256Gcm("REFRESH_2", getCnaTokenEncryptionSecret());

        // First read: expired access token (will attempt refresh with refreshEnc1)
        getCnaIracingTokensByCustId
            .mockResolvedValueOnce({
                iracingCustId: 1,
                accessToken: "ACCESS_1",
                accessExpiresAt: new Date(Date.now() - 1_000).toISOString(),
                refreshTokenEnc: refreshEnc1,
                refreshExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
                scope: "iracing.auth",
                updatedAt: "2026-02-03T00:00:00.000Z",
            })
            // Second read (after refresh error): tokens already rotated by another request.
            .mockResolvedValueOnce({
                iracingCustId: 1,
                accessToken: "ACCESS_2",
                accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                refreshTokenEnc: refreshEnc2,
                refreshExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
                scope: "iracing.auth",
                updatedAt: "2026-02-03T00:00:01.000Z",
            });

        vi.mocked(refreshIracingToken).mockRejectedValueOnce(new IracingOAuthError("invalid_grant", "used"));

        const access = await getValidIracingAuthAccessToken(1);
        expect(access).toBe("ACCESS_2");
        expect(deleteCnaIracingTokensByCustId).not.toHaveBeenCalled();
    });
});
