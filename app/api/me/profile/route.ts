import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/currentUser";
import { upsertCnaUser } from "@/lib/db/cnaUsers";
import { getCnaUserProfile, upsertCnaUserProfile } from "@/lib/db/cnaUserProfiles";
import { parseEditableUserProfile } from "@/lib/user/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null, profile: null });

    try {
        const profile = await getCnaUserProfile(user.iracingCustId);
        return NextResponse.json({
            user,
            profile: profile
                ? {
                    nickname: profile.nickname,
                    discord: profile.discord,
                    bio: profile.bio,
                    preferredCar: profile.preferredCar,
                    carNumber: profile.carNumber,
                    links: profile.links,
                }
                : null,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: "server_error", error_description: msg }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "unauthorized", error_description: "Login required." }, { status: 401 });
    }

    let profile;
    try {
        profile = parseEditableUserProfile(await request.json());
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid body.";
        return NextResponse.json({ error: "invalid_request", error_description: msg }, { status: 400 });
    }

    try {
        // Ensure cna_users exists for this user (foreign key for profiles).
        await upsertCnaUser({ iracingCustId: user.iracingCustId, iracingName: user.iracingName });
        await upsertCnaUserProfile(user.iracingCustId, profile);
        return NextResponse.json({ ok: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: "server_error", error_description: msg }, { status: 500 });
    }
}

