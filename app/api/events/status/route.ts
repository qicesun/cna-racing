import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/currentUser";
import { getEventById } from "@/lib/events/catalog";
import { getSignupStore } from "@/lib/signup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIds(idsParam: string | null): string[] {
    if (!idsParam) return [];
    const parts = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    // Preserve order but remove duplicates.
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of parts) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

export async function GET(request: NextRequest) {
    const ids = parseIds(request.nextUrl.searchParams.get("ids"));
    if (ids.length === 0) return NextResponse.json({ events: {} });

    const unknown = ids.filter((id) => !getEventById(id));
    if (unknown.length > 0) {
        return NextResponse.json(
            { error: "invalid_request", error_description: "Unknown event id(s).", unknown },
            { status: 400 }
        );
    }

    try {
        const user = await getCurrentUser();
        const store = getSignupStore();
        const rows = await store.listSignupRowsForEvents(ids);

        const counts = new Map<string, number>();
        const signedUp = new Set<string>();

        for (const r of rows) {
            counts.set(r.eventId, (counts.get(r.eventId) ?? 0) + 1);
            if (user && r.iracingCustId === user.iracingCustId) {
                signedUp.add(r.eventId);
            }
        }

        const events: Record<string, { count: number; signedUp: boolean }> = {};
        for (const id of ids) {
            events[id] = {
                count: counts.get(id) ?? 0,
                signedUp: user ? signedUp.has(id) : false,
            };
        }

        return NextResponse.json({ events });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
            { error: "server_error", error_description: msg },
            { status: 500 }
        );
    }
}
