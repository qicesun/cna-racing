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
    SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { sanitizeNextPath, safeEqual } from "@/lib/auth/utils";
import { upsertCnaUser } from "@/lib/db/cnaUsers";

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
            scope: "iracing.profile",
        });
    } catch (e) {
        if (e instanceof IracingOAuthError) {
            return redirectWithError(request, { error: e.error, error_description: e.errorDescription });
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        return redirectWithError(request, { error: "server_error", error_description: msg });
    }

    let profile;
    try {
        profile = await fetchIracingProfile(token.access_token);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return redirectWithError(request, { error: "server_error", error_description: msg });
    }

    // Best-effort persistence of CNA account data for features like the Drivers directory.
    // This should never block login if the DB is misconfigured or down.
    try {
        await upsertCnaUser({
            iracingCustId: profile.iracing_cust_id,
            iracingName: profile.iracing_name,
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
                iracingCustId: profile.iracing_cust_id,
                iracingName: profile.iracing_name,
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
