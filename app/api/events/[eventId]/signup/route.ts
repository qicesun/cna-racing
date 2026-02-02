import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/currentUser";
import { getEventById, normalizeEventId } from "@/lib/events/catalog";
import { getSignupStore } from "@/lib/signup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readEventId(context: { params: { eventId: string } | Promise<{ eventId: string }> }): Promise<string> {
    const rawEventId = (await Promise.resolve(context.params)).eventId;
    return normalizeEventId(rawEventId);
}

export async function POST(_request: NextRequest, context: { params: { eventId: string } | Promise<{ eventId: string }> }) {
    const eventId = await readEventId(context);

    const event = getEventById(eventId);
    if (!event) {
        return NextResponse.json(
            { error: "not_found", error_description: "Event not found." },
            { status: 404 }
        );
    }

    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json(
            { error: "unauthorized", error_description: "Login required." },
            { status: 401 }
        );
    }

    try {
        const store = getSignupStore();
        const result = await store.createSignup(eventId, {
            iracingCustId: user.iracingCustId,
            iracingName: user.iracingName,
        });

        return NextResponse.json({ ok: true, created: result.created });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
            { error: "server_error", error_description: msg },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    context: { params: { eventId: string } | Promise<{ eventId: string }> }
) {
    const eventId = await readEventId(context);

    const event = getEventById(eventId);
    if (!event) {
        return NextResponse.json(
            { error: "not_found", error_description: "Event not found." },
            { status: 404 }
        );
    }

    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json(
            { error: "unauthorized", error_description: "Login required." },
            { status: 401 }
        );
    }

    try {
        const store = getSignupStore();
        const result = await store.deleteSignup(eventId, user.iracingCustId);
        return NextResponse.json({ ok: true, deleted: result.deleted });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
            { error: "server_error", error_description: msg },
            { status: 500 }
        );
    }
}
