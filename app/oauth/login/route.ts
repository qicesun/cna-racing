import { NextRequest, NextResponse } from "next/server";

import { createPkcePair, createState } from "@/lib/auth/pkce";
import { buildIracingAuthorizeUrl, getIracingOAuthConfig } from "@/lib/auth/iracing";
import {
    IRACING_OAUTH_COOKIE_NAME,
    IRACING_OAUTH_COOKIE_PATH,
    IRACING_OAUTH_MAX_AGE_SECONDS,
    IracingOAuthCookiePayloadV1,
} from "@/lib/auth/iracingOAuthCookie";
import { getCnaOAuthCookieSecret } from "@/lib/auth/secrets";
import { createSignedValue } from "@/lib/auth/signed";
import { sanitizeNextPath } from "@/lib/auth/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const cfg = getIracingOAuthConfig();

    // PKCE verifier is stored in a first-party cookie, so login+callback must happen on the same origin.
    // If you're developing locally, ask iRacing to add your localhost/staging redirect URI first.
    const redirectOrigin = new URL(cfg.redirectUri).origin;
    if (request.nextUrl.origin !== redirectOrigin) {
        const redirect = new URL("/account", request.nextUrl.origin);
        redirect.searchParams.set("error", "invalid_request");
        redirect.searchParams.set(
            "error_description",
            `OAuth redirect origin mismatch. Open ${redirectOrigin} to login, or register ${request.nextUrl.origin}${IRACING_OAUTH_COOKIE_PATH}/callback as a Redirect URI in iRacing.`
        );
        return NextResponse.redirect(redirect);
    }

    const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
    const pkce = createPkcePair();
    const state = createState();
    const now = Date.now();

    const payload: IracingOAuthCookiePayloadV1 = {
        v: 1,
        state,
        codeVerifier: pkce.verifier,
        next: nextPath,
        iat: now,
        exp: now + IRACING_OAUTH_MAX_AGE_SECONDS * 1000,
    };

    const cookieValue = createSignedValue(payload, getCnaOAuthCookieSecret());
    const authorizeUrl = buildIracingAuthorizeUrl({
        baseUrl: cfg.baseUrl,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        scope: "iracing.profile",
        state,
        codeChallenge: pkce.challenge,
        codeChallengeMethod: pkce.method,
    });

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set(IRACING_OAUTH_COOKIE_NAME, cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: IRACING_OAUTH_COOKIE_PATH,
        maxAge: IRACING_OAUTH_MAX_AGE_SECONDS,
    });

    return res;
}
