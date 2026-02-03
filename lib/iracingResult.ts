export type IRacingEventResultFile = {
    type?: string;
    data: IRacingEventResult;
};

export type IRacingEventResult = {
    start_time?: string;
    end_time?: string;
    series_name?: string;
    season_name?: string;
    session_name?: string;
    track?: {
        track_name?: string;
        config_name?: string;
        track_id?: number;
    };
    session_results?: Array<{
        simsession_number: number;
        simsession_name: string; // "PRACTICE" / "QUALIFY" / "RACE"
        simsession_type_name?: string; // "Race" / "Open Qualifying"
        results: Array<IRacingDriverRow>;
    }>;
};

export type IRacingDriverRow = {
    cust_id?: number;
    display_name?: string;
    car_name?: string;
    car_number?: string | number | null;

    // Note: iRacing JSON uses 0-based positions in many cases
    position?: number; // 0-based
    finish_position?: number; // 0-based
    finish_position_in_class?: number; // 0-based
    starting_position?: number; // 0-based
    champ_points?: number;


    laps_complete?: number;
    incidents?: number;
    reason_out?: string;

    interval?: number; // often ms (winner=0)
    best_lap_time?: number; // ms
    average_lap?: number; // ms
};

export function msToClock(ms?: number | null) {
    if (ms === null || ms === undefined) return "—";
    if (!Number.isFinite(ms)) return "—";
    if (ms < 0) return "—";

    const total = Math.floor(ms);
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const milli = total % 1000;

    const s = String(seconds).padStart(2, "0");
    const m = String(milli).padStart(3, "0");
    return `${minutes}:${s}.${m}`;
}

export function formatLocal(iso?: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function isFinishedByStart(startIso?: string) {
    if (!startIso) return false;
    const t = Date.parse(startIso);
    if (!Number.isFinite(t)) return false;
    return Date.now() > t;
}

export function getSession(result: IRacingEventResult, name: "RACE" | "QUALIFY" | "PRACTICE") {
    const sessions = result.session_results ?? [];
    return sessions.find((s) => String(s.simsession_name).toUpperCase() === name) ?? null;
}

export function sortByFinishPosition(rows: IRacingDriverRow[]) {
    return rows.slice().sort((a, b) => {
        const ap = (a.finish_position ?? a.position ?? 999999);
        const bp = (b.finish_position ?? b.position ?? 999999);
        return ap - bp;
    });
}

export function topN(rows: IRacingDriverRow[], n: number) {
    const sorted = sortByFinishPosition(rows);
    return sorted.slice(0, n);
}

export function pos1(row: IRacingDriverRow) {
    // convert 0-based to 1-based
    const p = row.finish_position ?? row.position;
    if (p === undefined || p === null) return "—";
    return String(Number(p) + 1);
}

export function unwrapIRacingEvent(json: any): IRacingEventResult | null {
    if (!json) return null;

    // 格式 A: { type, data: {...} }
    if (json.data && typeof json.data === "object") return json.data as IRacingEventResult;

    // 格式 B: 直接就是 event 对象
    if (json.session_results && typeof json === "object") return json as IRacingEventResult;

    return null;
}

