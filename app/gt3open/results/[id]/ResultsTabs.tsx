"use client";

import { useMemo, useState } from "react";
import { msToClock } from "@/lib/iracingResult";

type Props = {
    practiceTitle?: string;
    qualiTitle: string;
    raceTitle: string;
    practiceSubtitle?: string;
    qualiSubtitle: string;
    raceSubtitle: string;
    practiceRows?: any[];
    qualiRows: any[];
    raceRows: any[];
};

function pos1(r: any) {
    const v =
        r?.finish_position ??
        r?.position ??
        r?.class_position ??
        r?.fin_pos ??
        r?.pos;
    const n = Number(v);
    return Number.isFinite(n) ? n + 1 : "—"; // iRacing 常见是 0-based
}

/** iRacing ticks: 1/10000 秒 = 0.1ms */
function ticksToMs(ticks: number) {
    return Math.round(ticks / 10);
}

/** interval：优先 class_interval，其次 interval；WIN/—/+gap */
function formatInterval(row: any) {
    if (!row) return "—";

    const ci = typeof row.class_interval === "number" ? row.class_interval : null;
    const iv = typeof row.interval === "number" ? row.interval : null;
    const ticks = ci ?? iv;

    if (ticks === null || ticks === undefined) return "—";
    if (ticks === -1) return "—";
    if (ticks === 0) return "WIN";

    const ms = ticksToMs(Math.abs(ticks));
    return `+${msToClock(ms)}`;
}

/** best lap：iRacing best_lap_time 也是 ticks（不是毫秒） */
function formatBestLap(row: any) {
    const t = row?.best_lap_time;
    if (typeof t !== "number" || t <= 0) return "—";
    return msToClock(ticksToMs(t));
}

/** points：优先 champ_points，其次 points/agg_pts 等 */
function getPoints(row: any) {
    const cand = row?.champ_points ?? row?.points ?? row?.agg_pts ?? row?.agg_points;
    const n = Number(cand);
    return Number.isFinite(n) ? n : 0;
}

export default function ResultsTabs({
    practiceTitle,
                                        qualiTitle,
                                        raceTitle,
    practiceSubtitle,
                                        qualiSubtitle,
                                        raceSubtitle,
    practiceRows,
                                        qualiRows,
                                        raceRows,
                                    }: Props) {
    const hasPractice = Array.isArray(practiceRows);
    const [tab, setTab] = useState<"RACE" | "QUALIFY" | "PRACTICE">("RACE");

    const rows = tab === "RACE" ? raceRows : tab === "QUALIFY" ? qualiRows : practiceRows ?? [];
    const subtitle = tab === "RACE" ? raceSubtitle : tab === "QUALIFY" ? qualiSubtitle : (practiceSubtitle ?? "Practice");
    const title = tab === "RACE" ? raceTitle : tab === "QUALIFY" ? qualiTitle : (practiceTitle ?? "PRACTICE");

    // 找最快圈（用于紫色）
    const fastestBestLapMs = useMemo(() => {
        let best = Infinity;
        for (const r of rows ?? []) {
            const t = r?.best_lap_time;
            if (typeof t === "number" && t > 0) {
                const ms = ticksToMs(t);
                if (ms > 0 && ms < best) best = ms;
            }
        }
        return Number.isFinite(best) ? best : null;
    }, [rows]);

    return (
        <div className="mt-10">
            {/* Tabs */}
            <div className="flex items-center justify-end gap-2">
                {hasPractice && (
                    <button
                        onClick={() => setTab("PRACTICE")}
                        className={[
                            "rounded-xl px-4 py-2 text-sm font-semibold border transition",
                            tab === "PRACTICE"
                                ? "bg-white text-zinc-950 border-white"
                                : "bg-white/5 text-zinc-200 border-white/15 hover:bg-white/10",
                        ].join(" ")}
                    >
                        Practice
                    </button>
                )}
                <button
                    onClick={() => setTab("RACE")}
                    className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold border transition",
                        tab === "RACE"
                            ? "bg-white text-zinc-950 border-white"
                            : "bg-white/5 text-zinc-200 border-white/15 hover:bg-white/10",
                    ].join(" ")}
                >
                    Race
                </button>
                <button
                    onClick={() => setTab("QUALIFY")}
                    className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold border transition",
                        tab === "QUALIFY"
                            ? "bg-white text-zinc-950 border-white"
                            : "bg-white/5 text-zinc-200 border-white/15 hover:bg-white/10",
                    ].join(" ")}
                >
                    Qualify
                </button>
            </div>

            {/* Table */}
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div>
                        <div className="text-lg font-semibold text-zinc-100">{title}</div>
                        <div className="text-sm text-zinc-400">{subtitle}</div>
                    </div>
                    <div className="text-sm text-zinc-400">Rows: {rows?.length ?? 0}</div>
                </div>

                <div className="overflow-auto">
                    <table className="min-w-[1000px] w-full text-sm">
                        <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-white/10">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Pos</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Driver</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Car</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Laps</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Inc</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Interval</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Best Lap</th>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Points</th>
                        </tr>
                        </thead>

                        <tbody>
                        {(rows ?? []).map((r: any) => {
                            const bestLapTicks = r?.best_lap_time;
                            const bestLapMs =
                                typeof bestLapTicks === "number" && bestLapTicks > 0
                                    ? ticksToMs(bestLapTicks)
                                    : null;

                            const isFastest =
                                fastestBestLapMs !== null &&
                                bestLapMs !== null &&
                                bestLapMs === fastestBestLapMs;

                            return (
                                <tr
                                    key={`${r.cust_id ?? r.display_name}-${r.finish_position ?? r.position ?? Math.random()}`}
                                    className="border-b border-white/5 hover:bg-white/5"
                                >
                                    <td className="px-4 py-3 text-zinc-200 font-semibold">{pos1(r)}</td>
                                    <td className="px-4 py-3 text-zinc-200">{r.display_name ?? "—"}</td>
                                    <td className="px-4 py-3 text-zinc-200">{r.car_name ?? "—"}</td>
                                    <td className="px-4 py-3 text-zinc-200">{r.laps_complete ?? "—"}</td>
                                    <td className="px-4 py-3 text-zinc-200">{r.incidents ?? "—"}</td>

                                    <td className="px-4 py-3 text-zinc-200 font-mono">
                                        {formatInterval(r)}
                                    </td>

                                    <td
                                        className={[
                                            "px-4 py-3 font-mono",
                                            isFastest ? "text-violet-400 font-semibold" : "text-zinc-200",
                                        ].join(" ")}
                                    >
                                        {formatBestLap(r)}
                                    </td>

                                    <td className="px-4 py-3 text-zinc-200 font-semibold">
                                        {tab === "RACE" ? getPoints(r) : 0}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                {(rows?.length ?? 0) === 0 && (
                    <div className="px-6 py-6 text-zinc-300">No results found in this session.</div>
                )}
            </div>
        </div>
    );
}
