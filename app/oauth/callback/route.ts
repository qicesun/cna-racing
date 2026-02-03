import { NextRequest, NextResponse } from "next/server";

import {
    exchangeAuthorizationCodeForToken,
    fetchIracingProfile,
    getIracingOAuthConfig,
    IracingOAuthError,
} from "@/lib/auth/iracing";
import {
    IRACING_OAUTH_COOKIE_NAME,
    IRACING_OAUTH_COOKIE_PATH,
    IracingOAuthCookiePayloadV1,
} from "@/lib/auth/iracingOAuthCookie";
import { getCnaOAuthCookieSecret } from "@/lib/auth/secrets";
import { readSignedValue } from "@/lib/auth/signed";
import {
    createSessionCookieValue,
    DEFAULT_SESSION_MAX_AGE_SECONDS,
    readSessionCookieValue,
    SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { sanitizeNextPath, safeEqual } from "@/lib/auth/utils";
import { upsertCnaUser } from "@/lib/db/cnaUsers";
import { upsertCnaIracingMemberInfo } from "@/lib/db/cnaIracingMemberInfo";
import { storeIracingAuthTokens } from "@/lib/iracing/tokenStore";
import { fetchIracingMemberInfo } from "@/lib/iracing/memberInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearOAuthCookie(res: NextResponse) {
    res.cookies.set(IRACING_OAUTH_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: IRACING_OAUTH_COOKIE_PATH,
        maxAge: 0,
    });
}

function redirectWithError(request: NextRequest, params: { error: string; error_description?: string }) {
    const redirect = new URL("/account", request.nextUrl.origin);
    redirect.searchParams.set("error", params.error);
    if (params.error_description) {
        redirect.searchParams.set("error_description", params.error_description);
    }
    const res = NextResponse.redirect(redirect);
    clearOAuthCookie(res);
    return res;
}

export async function GET(request: NextRequest) {
    // If the auth server redirected with an error, surface it to the user.
    const err = request.nextUrl.searchParams.get("error");
    if (err) {
        const desc = request.nextUrl.searchParams.get("error_description") ?? undefined;
        return redirectWithError(request, { error: err, error_description: desc });
    }

    const code = request.nextUrl.searchParams.get("code");
    const returnedState = request.nextUrl.searchParams.get("state");

    if (!code || !returnedState) {
        return redirectWithError(request, { error: "invalid_request", error_description: "Missing code or state." });
    }

    const cookieValue = request.cookies.get(IRACING_OAUTH_COOKIE_NAME)?.value;
    if (!cookieValue) {
        return redirectWithError(request, { error: "invalid_request", error_description: "OAuth state cookie missing or expired." });
    }

    const payload = readSignedValue<IracingOAuthCookiePayloadV1>(cookieValue, getCnaOAuthCookieSecret());
    if (!payload || payload.v !== 1) {
        return redirectWithError(request, { error: "invalid_request", error_description: "Invalid OAuth state cookie." });
    }

    if (
        typeof payload.state !== "string" ||
        typeof payload.codeVerifier !== "string" ||
        typeof payload.next !== "string"
    ) {
        return redirectWithError(request, { error: "invalid_request", error_description: "Invalid OAuth state cookie (bad types)." });
    }

    const requestedScope =
        payload.scope === undefined || payload.scope === "iracing.profile"
            ? "iracing.profile"
            : payload.scope === "iracing.auth"
                ? "iracing.auth"
                : null;
    if (!requestedScope) {
        return redirectWithError(request, { error: "invalid_request", error_description: "Invalid OAuth state cookie (bad scope)." });
    }

    if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) {
        return redirectWithError(request, { error: "invalid_request", error_description: "OAuth state cookie expired." });
    }

    if (!safeEqual(payload.state, returnedState)) {
        return redirectWithError(request, { error: "invalid_request", error_description: "Invalid OAuth state." });
    }

    // Exchange code -> access token, then fetch basic identity from /iracing/profile.
    const cfg = getIracingOAuthConfig();
    if (!cfg.clientSecret && process.env.NODE_ENV === "production") {
        return redirectWithError(request, {
            error: "server_error",
            error_description: "Server misconfigured: IRACING_CLIENT_SECRET is missing.",
        });
    }

    let token;
    try {
        token = await exchangeAuthorizationCodeForToken({
            code,
            codeVerifier: payload.codeVerifier,
            scope: requestedScope,
        });
    } catch (e) {
        if (e instanceof IracingOAuthError) {
            return redirectWithError(request, { error: e.error, error_description: e.errorDescription });
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        return redirectWithError(request, { error: "server_error", error_description: msg });
    }

    // Session secret might be missing/misconfigured (especially in tests); treat existing session as optional.
    const existingSession = (() => {
        try {
            return readSessionCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);
        } catch {
            return null;
        }
    })();

    let iracingCustId: number | null = null;
    let iracingName: string | null = null;
    let memberInfo: Awaited<ReturnType<typeof fetchIracingMemberInfo>> | null = null;

    if (requestedScope === "iracing.auth") {
        // Data API Workflow: prefer /data/member/info (also gives rich fields we can cache).
        try {
            memberInfo = await fetchIracingMemberInfo(token.access_token);
            iracingCustId = memberInfo.custId;
            iracingName = memberInfo.displayName ?? null;
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            return redirectWithError(request, { error: "server_error", error_description: msg });
        }

        // Some Data API responses may omit display_name; fall back to the current session name when possible.
        if (!iracingName) {
            iracingName = existingSession?.user.iracingName ?? "iRacing Member";
        }
    }

    if (!iracingCustId || !iracingName) {
        // Identity Verification Workflow: exchange+fetch /iracing/profile.
        // Also used as a fallback when we can't read identity from /data/member/info.
        try {
            const profile = await fetchIracingProfile(token.access_token);
            iracingCustId = profile.iracing_cust_id;
            iracingName = profile.iracing_name;
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            return redirectWithError(request, { error: "server_error", error_description: msg });
        }
    }

    if (existingSession && existingSession.user.iracingCustId !== iracingCustId) {
        return redirectWithError(request, {
            error: "invalid_request",
            error_description: "iRacing account mismatch for this session. Please logout and try again.",
        });
    }

    if (requestedScope === "iracing.auth") {
        // Persist tokens for future refreshes. This is required for the "connected" state.
        try {
            await storeIracingAuthTokens({ iracingCustId, token });
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            return redirectWithError(request, { error: "server_error", error_description: msg });
        }

        // Cache member info for public profile display. Best-effort; should not block login/connect.
        try {
            const info = memberInfo ?? (await fetchIracingMemberInfo(token.access_token));
            const now = Date.now();
            await upsertCnaIracingMemberInfo({
                iracingCustId: info.custId,
                data: info,
                fetchedAt: new Date(now).toISOString(),
                expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
            });
        } catch (e) {
            if (process.env.NODE_ENV === "production") {
                console.error("upsertCnaIracingMemberInfo failed", e);
            }
        }
    }

    // Best-effort persistence of CNA account data for features like the Drivers directory.
    // This should never block login if the DB is misconfigured or down.
    try {
        await upsertCnaUser({
            iracingCustId,
            iracingName,
        });
    } catch (e) {
        // Avoid noisy logs in local/test envs; still log in production for debugging.
        if (process.env.NODE_ENV === "production") {
            console.error("upsertCnaUser failed", e);
        }
    }

    // Create a signed session cookie. This is enough for upcoming signup/team features.
    let sessionValue: string;
    try {
        sessionValue = createSessionCookieValue(
            {
                iracingCustId,
                iracingName,
            },
            { maxAgeSeconds: DEFAULT_SESSION_MAX_AGE_SECONDS }
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return redirectWithError(request, { error: "server_error", error_description: msg });
    }

    const nextPath = sanitizeNextPath(payload.next);
    const redirectTo = new URL(nextPath, request.nextUrl.origin);

    const res = NextResponse.redirect(redirectTo);
    clearOAuthCookie(res);
    res.cookies.set(SESSION_COOKIE_NAME, sessionValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
    });

    return res;
}
