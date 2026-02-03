"use client";

import { useMemo, useState } from "react";

import DriverLink from "@/components/DriverLink";

export type DriverProfile = {
    iracingCustId?: number | null;
    name: string;
    points: number;
    starts: number;
    irating?: number | null;
    safetyRating?: number | null;
    lastLoginAt?: string | null;
    series: string[];
    lastRace?: {
        series: string;
        track: string;
        date?: string;
    } | null;
};

type SortKey = "points" | "name" | "starts" | "irating";

type ViewMode = "grid" | "list";

type DriversClientProps = {
    drivers: DriverProfile[];
};

export default function DriversClient({ drivers }: DriversClientProps) {
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("points");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");

    const loginTs = (d: DriverProfile): number => {
        const raw = d.lastLoginAt;
        if (!raw) return 0;
        const t = Date.parse(raw);
        return Number.isFinite(t) ? t : 0;
    };

    const filtered = useMemo(() => {
        const search = query.trim().toLowerCase();
        let list = drivers;

        if (search) {
            list = list.filter((driver) => {
                const hay = [driver.name, driver.series.join(" "), driver.lastRace?.track ?? ""]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(search);
            });
        }

        const sorted = [...list].sort((a, b) => {
            switch (sortKey) {
                case "name":
                    return a.name.localeCompare(b.name) || loginTs(b) - loginTs(a);
                case "starts":
                    return (
                        (b.starts ?? 0) - (a.starts ?? 0) ||
                        (b.points ?? 0) - (a.points ?? 0) ||
                        loginTs(b) - loginTs(a) ||
                        a.name.localeCompare(b.name)
                    );
                case "irating":
                    return (
                        (b.irating ?? 0) - (a.irating ?? 0) ||
                        (b.points ?? 0) - (a.points ?? 0) ||
                        loginTs(b) - loginTs(a) ||
                        a.name.localeCompare(b.name)
                    );
                case "points":
                default:
                    return (
                        (b.points ?? 0) - (a.points ?? 0) ||
                        (b.starts ?? 0) - (a.starts ?? 0) ||
                        loginTs(b) - loginTs(a) ||
                        a.name.localeCompare(b.name)
                    );
            }
        });

        return sorted;
    }, [drivers, query, sortKey]);

    return (
        <div className="mt-8">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
                    <label className="flex-1">
                        <span className="sr-only">搜索车手</span>
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索车手"
                            className="w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                        />
                    </label>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span className="uppercase tracking-widest">SORT</span>
                        <div className="flex flex-wrap gap-2">
                            {([
                                { key: "points", label: "Points" },
                                { key: "name", label: "Name" },
                                { key: "starts", label: "Starts" },
                                { key: "irating", label: "iRating" },
                            ] as const).map((item) => (
                                <button
                                    key={item.key}
                                    onClick={() => setSortKey(item.key)}
                                    className={[
                                        "rounded-full px-3 py-1 text-xs font-semibold transition",
                                        sortKey === item.key
                                            ? "bg-white text-zinc-950"
                                            : "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                                    ].join(" ")}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="uppercase tracking-widest">VIEW</span>
                    <div className="flex gap-2">
                        {([
                            { key: "grid", label: "Grid" },
                            { key: "list", label: "List" },
                        ] as const).map((item) => (
                            <button
                                key={item.key}
                                onClick={() => setViewMode(item.key)}
                                className={[
                                    "rounded-full px-3 py-1 text-xs font-semibold transition",
                                    viewMode === item.key
                                        ? "bg-white text-zinc-950"
                                        : "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                                ].join(" ")}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* GRID MODE (cards) */}
            {viewMode === "grid" && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((driver) => (
                        <div
                            key={driver.iracingCustId ?? driver.name}
                            className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    {driver.iracingCustId ? (
                                        <div className="flex items-center gap-2">
                                            <DriverLink
                                                custId={driver.iracingCustId}
                                                name={driver.name}
                                                className="text-lg font-semibold text-white hover:underline"
                                            />
                                            {driver.lastLoginAt ? (
                                                <span
                                                    className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-emerald-200"
                                                    title="Logged into CNA Racing"
                                                >
                                                    CNA
                                                </span>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="text-lg font-semibold text-white">{driver.name}</div>
                                    )}
                                    <div className="mt-2 text-xs text-zinc-400">
                                        CNA 积分: {driver.points} · 参赛次数: {driver.starts}
                                    </div>
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-200">
                                    {driver.series.length > 0 ? driver.series.join(" / ") : "—"}
                                </div>
                            </div>

                            <div className="mt-4 text-xs text-zinc-400">
                                最近参赛: {driver.lastRace?.series ?? "—"} · {driver.lastRace?.track ?? "—"}
                            </div>

                            {driver.lastRace?.date && (
                                <div className="mt-1 text-[11px] text-zinc-500">{driver.lastRace.date}</div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-200">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            iR: {driver.irating ?? "—"}
          </span>
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            SR: {driver.safetyRating ?? "—"}
          </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* LIST MODE (table) */}
            {viewMode === "list" && (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-zinc-950/80 backdrop-blur border-b border-white/10">
                        <tr className="text-left text-zinc-400">
                            <th className="px-4 py-3">Driver</th>
                            <th className="px-4 py-3">Points</th>
                            <th className="px-4 py-3">Starts</th>
                            <th className="px-4 py-3">iRating</th>
                            <th className="px-4 py-3">SR</th>
                            <th className="px-4 py-3">Last Race</th>
                            <th className="px-4 py-3">Series</th>
                        </tr>
                        </thead>

                        <tbody>
                        {filtered.map((driver) => (
                            <tr
                                key={driver.iracingCustId ?? driver.name}
                                className="border-b border-white/5 hover:bg-white/5 transition"
                            >
                                <td className="px-4 py-3 font-semibold text-white">
                                    {driver.iracingCustId ? (
                                        <div className="flex items-center gap-2">
                                            <DriverLink
                                                custId={driver.iracingCustId}
                                                name={driver.name}
                                                className="hover:underline"
                                            />
                                            {driver.lastLoginAt ? (
                                                <span
                                                    className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-emerald-200"
                                                    title="Logged into CNA Racing"
                                                >
                                                    CNA
                                                </span>
                                            ) : null}
                                        </div>
                                    ) : (
                                        driver.name
                                    )}
                                </td>

                                <td className="px-4 py-3 text-zinc-200 tabular-nums">
                                    {driver.points}
                                </td>

                                <td className="px-4 py-3 text-zinc-200 tabular-nums">
                                    {driver.starts}
                                </td>

                                <td className="px-4 py-3 text-zinc-200 tabular-nums">
                                    {driver.irating ?? "—"}
                                </td>

                                <td className="px-4 py-3 text-zinc-200 tabular-nums">
                                    {driver.safetyRating ?? "—"}
                                </td>

                                <td className="px-4 py-3 text-zinc-300">
                                    {driver.lastRace
                                        ? `${driver.lastRace.series} · ${driver.lastRace.track}`
                                        : "—"}
                                </td>

                                <td className="px-4 py-3 text-zinc-300">
                                    {driver.series.length > 0 ? driver.series.join(" / ") : "—"}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}


            {filtered.length === 0 && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
                    没有找到匹配的车手。可以清空搜索条件再试试。
                </div>
            )}
        </div>
    );
}
