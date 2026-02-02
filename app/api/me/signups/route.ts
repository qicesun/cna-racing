import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/currentUser";
import { getEventById } from "@/lib/events/catalog";
import { getSignupStore } from "@/lib/signup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null, signups: [] });

    try {
        const store = getSignupStore();
        const rows = await store.listSignupsForUser(user.iracingCustId);

        const signups = rows
            .map((r) => {
                const event = getEventById(r.eventId);
                if (!event) return null;
                return { event, createdAt: r.createdAt };
            })
            .filter((s): s is { event: NonNullable<ReturnType<typeof getEventById>>; createdAt: string } => s !== null);

        return NextResponse.json({ user, signups });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
            { error: "server_error", error_description: msg },
            { status: 500 }
        );
    }
}
