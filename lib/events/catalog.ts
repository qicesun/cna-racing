import { gt3open } from "@/data/gt3open";
import { rookie } from "@/data/rookie";

export type Event = {
    eventId: string;
    seriesKey: string;
    seriesName: string;
    seasonName: string;
    seasonKey: string;
    round: number;
    track: string;
    trackKey?: string;
    cover: string | null; // preferred cover derived from trackKey (e.g. /tracks/suzuka.png)
    start: string;
    format?: string;
    note?: string;
    broadcast?: string;
};

type SeriesData = {
    seriesName: string;
    seasonName: string;
    races: Array<{
        round: number;
        track: string;
        trackKey?: string;
        start: string;
        format?: string;
        note?: string;
        broadcast?: string;
    }>;
};

export function coverFromTrackKey(trackKey?: string): string | null {
    if (!trackKey) return null;
    // Keep this purely string-based so it works in server + client code (no fs checks).
    return `/tracks/${trackKey}.png`;
}

function slugifyKey(input: string): string {
    return (
        input
            .trim()
            .toLowerCase()
            // keep ASCII-only keys for URLs/DB ids
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
    );
}

export function deriveSeasonKey(seasonName: string): string {
    const m = seasonName.match(/(\d{2}S\d+)/i);
    if (m?.[1]) return m[1].toUpperCase();
    return slugifyKey(seasonName) || "season";
}

export function makeEventId(seriesKey: string, seasonKey: string, round: number): string {
    return `${seriesKey}:${seasonKey}:${round}`;
}

// Next.js route params may be percent-encoded (e.g. `gt3open%3A26S1%3A1`).
// Normalize to the canonical event id used by our catalog + DB.
export function normalizeEventId(eventIdParam: string): string {
    try {
        return decodeURIComponent(eventIdParam);
    } catch {
        return eventIdParam;
    }
}

export function parseEventId(eventId: string): { seriesKey: string; seasonKey: string; round: number } | null {
    const parts = eventId.split(":");
    if (parts.length !== 3) return null;
    const [seriesKey, seasonKey, roundRaw] = parts;
    if (!seriesKey || !seasonKey) return null;
    const round = Number(roundRaw);
    if (!Number.isFinite(round) || !Number.isInteger(round) || round <= 0) return null;
    return { seriesKey, seasonKey, round };
}

const SERIES: Array<{ key: string; data: SeriesData }> = [
    { key: "gt3open", data: gt3open as SeriesData },
    { key: "rookie", data: rookie as SeriesData },
];

let cachedEvents: Event[] | null = null;
let cachedById: Map<string, Event> | null = null;

export function listAllEvents(): Event[] {
    if (cachedEvents) return cachedEvents;

    const events: Event[] = [];
    for (const s of SERIES) {
        const seasonKey = deriveSeasonKey(s.data.seasonName);
        for (const r of s.data.races) {
            events.push({
                eventId: makeEventId(s.key, seasonKey, r.round),
                seriesKey: s.key,
                seriesName: s.data.seriesName,
                seasonName: s.data.seasonName,
                seasonKey,
                round: r.round,
                track: r.track,
                trackKey: r.trackKey,
                cover: coverFromTrackKey(r.trackKey),
                start: r.start,
                format: r.format,
                note: r.note,
                broadcast: r.broadcast,
            });
        }
    }

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    cachedEvents = events;
    cachedById = new Map(events.map((e) => [e.eventId, e]));
    return events;
}

export function listEventsBySeries(seriesKey: string): Event[] {
    return listAllEvents().filter((e) => e.seriesKey === seriesKey);
}

export function getEventById(eventId: string): Event | null {
    if (!cachedById) listAllEvents();
    return cachedById?.get(eventId) ?? null;
}
