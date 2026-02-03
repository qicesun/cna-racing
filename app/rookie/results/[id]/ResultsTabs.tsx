"use client";

import { useMemo, useState } from "react";
import { msToClock, pos1 } from "@/lib/iracingResult";
import DriverLink from "@/components/DriverLink";

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

function timeAnyToMs(v: unknown): number | null {
    if (typeof v !== "number") return null;
    if (!Number.isFinite(v) || v < 0) return null;
    if (v === 0) return 0;

    // heuristic: 小值多半是“秒”，大值多半是“tick(1/10000s)”
    if (v < 100000) return Math.round(v * 1000);
    return Math.round(v / 10); // tick -> ms
}

function intervalText(r: any) {
    const raw = r?.class_interval ?? r?.interval;
    const ms = timeAnyToMs(raw);
    if (ms === null) return "—";
    if (ms === 0) return "WIN";
    return `+${msToClock(ms)}`;
}

function bestLapMs(r: any) {
    // 常见字段：best_lap_time
    // 有些导出会叫 best_lap_time 或 bestlap_time（保险一下）
    const raw = r?.best_lap_time ?? r?.bestlap_time ?? null;
    return timeAnyToMs(raw);
}

function pointsValue(r: any) {
    // iRacing 结果里常见字段命名差异很大：尽量兼容
    const candidates = [
        "championship_points",
        "champ_points",
        "points",
        "race_points",
        "new_points",
        "pos_points",
    ];
    for (const k of candidates) {
        const v = r?.[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return 0;
}

export default function ResultsTabs(props: Props) {
    const hasPractice = Array.isArray(props.practiceRows);
    const [tab, setTab] = useState<"practice" | "quali" | "race">("race");

    const rows =
        tab === "race"
            ? props.raceRows
            : tab === "quali"
                ? props.qualiRows
                : props.practiceRows ?? [];
    const subtitle =
        tab === "race"
            ? props.raceSubtitle
            : tab === "quali"
                ? props.qualiSubtitle
                : props.practiceSubtitle ?? "Practice";

    const fastestLapMs = useMemo(() => {
        let best: number | null = null;
        for (const r of rows) {
            const ms = bestLapMs(r);
            if (ms === null || ms <= 0) continue;
            if (best === null || ms < best) best = ms;
        }
        return best;
    }, [rows]);

    return (
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex flex-col gap-3 px-6 py-4 border-b border-white/10 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="text-lg font-semibold text-zinc-100">
                        {tab === "race"
                            ? props.raceTitle
                            : tab === "quali"
                                ? props.qualiTitle
                                : (props.practiceTitle ?? "PRACTICE")}
                    </div>
                    <div className="text-sm text-zinc-400">{subtitle}</div>
                </div>

                <div className="flex items-center gap-2">
                    {hasPractice && (
                        <button
                            onClick={() => setTab("practice")}
                            className={[
                                "rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                                tab === "practice"
                                    ? "bg-white text-zinc-950"
                                    : "bg-white/10 text-zinc-200 hover:bg-white/15",
                            ].join(" ")}
                        >
                            Practice
                        </button>
                    )}
                    <button
                        onClick={() => setTab("race")}
                        className={[
                            "rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                            tab === "race" ? "bg-white text-zinc-950" : "bg-white/10 text-zinc-200 hover:bg-white/15",
                        ].join(" ")}
                    >
                        Race
                    </button>
                    <button
                        onClick={() => setTab("quali")}
                        className={[
                            "rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                            tab === "quali" ? "bg-white text-zinc-950" : "bg-white/10 text-zinc-200 hover:bg-white/15",
                        ].join(" ")}
                    >
                        Quali
                    </button>
                </div>
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

                        {tab === "race" && (
                            <th className="px-4 py-3 text-left font-semibold text-zinc-200">Interval</th>
                        )}

                        <th className="px-4 py-3 text-left font-semibold text-zinc-200">Best Lap</th>
                        <th className="px-4 py-3 text-left font-semibold text-zinc-200">Points</th>
                    </tr>
                    </thead>

                    <tbody>
                    {rows.map((r: any) => {
                        const ms = bestLapMs(r);
                        const isFastest = fastestLapMs !== null && ms !== null && ms === fastestLapMs;

                        return (
                            <tr
                                key={`${r.cust_id}-${r.finish_position ?? r.position ?? Math.random()}`}
                                className="border-b border-white/5 hover:bg-white/5"
                            >
                                <td className="px-4 py-3 text-zinc-200 font-semibold">{pos1(r)}</td>
                                <td className="px-4 py-3 text-zinc-200">
                                    <DriverLink
                                        custId={typeof r.cust_id === "number" ? r.cust_id : Number(r.cust_id)}
                                        name={r.display_name ?? "—"}
                                        className="font-semibold text-zinc-200 hover:underline"
                                    />
                                </td>
                                <td className="px-4 py-3 text-zinc-200">{r.car_name ?? "—"}</td>
                                <td className="px-4 py-3 text-zinc-200">{r.laps_complete ?? "—"}</td>
                                <td className="px-4 py-3 text-zinc-200">{r.incidents ?? "—"}</td>

                                {tab === "race" && (
                                    <td className="px-4 py-3 text-zinc-200 font-mono">
                                        {intervalText(r)}
                                    </td>
                                )}

                                <td
                                    className={[
                                        "px-4 py-3 font-mono",
                                        isFastest ? "text-purple-400 font-semibold" : "text-zinc-200",
                                    ].join(" ")}
                                >
                                    {ms ? msToClock(ms) : "—"}
                                </td>

                                <td className="px-4 py-3 text-zinc-200 font-semibold">
                                    {tab === "race" ? pointsValue(r) : 0}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {rows.length === 0 && (
                <div className="px-6 py-6 text-zinc-300">No results found in this session.</div>
            )}
        </div>
    );
}
