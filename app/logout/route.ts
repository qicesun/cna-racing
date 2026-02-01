import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { sanitizeNextPath } from "@/lib/auth/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
    const redirectTo = new URL(nextPath, request.nextUrl.origin);

    const res = NextResponse.redirect(redirectTo);
    res.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    return res;
}

