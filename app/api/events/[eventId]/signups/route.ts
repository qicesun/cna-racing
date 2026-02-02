import { NextResponse } from "next/server";

import { getEventById } from "@/lib/events/catalog";
import { getSignupStore } from "@/lib/signup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    context: { params: { eventId: string } | Promise<{ eventId: string }> }
) {
    const { eventId } = await Promise.resolve(context.params);

    const event = getEventById(eventId);
    if (!event) {
        return NextResponse.json(
            { error: "not_found", error_description: "Event not found." },
            { status: 404 }
        );
    }

    try {
        const store = getSignupStore();
        const signups = await store.listSignupsForEvent(eventId);

        return NextResponse.json({
            event,
            count: signups.length,
            signups,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
            { error: "server_error", error_description: msg },
            { status: 500 }
        );
    }
}
