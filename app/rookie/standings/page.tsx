import Link from "next/link";

import { rookie } from "@/data/rookie";
import { deriveSeasonKey } from "@/lib/events/catalog";
import { computeSeriesStandings } from "@/lib/results/computeSeriesStandings";
import { listResolvedEventResultsBySeriesSeason } from "@/lib/results/resolvedEventResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RookieStandingsPage() {
    const seriesKey = "rookie";
    const seasonKey = deriveSeasonKey(rookie.seasonName);

    // Prefer imported DB results, but fall back to legacy public JSON (matched by start_time).
    const resolved = await listResolvedEventResultsBySeriesSeason({ seriesKey, seasonKey });

    const snapshot = computeSeriesStandings({
        seriesKey,
        seasonKey,
        events: resolved.map((r) => ({ eventId: r.eventId, raceResults: r.raceResults })),
    });

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">CNA ROOKIE</div>
                        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                            Standings <span className="opacity-90">积分</span>
                        </h1>
                        <div className="mt-2 text-sm text-zinc-400">
                            已计入 {snapshot.eventIds.length} 场比赛（优先 DB 导入结果；缺失时回退 public JSON）。
                        </div>
                    </div>

                    <Link
                        href="/rookie"
                        className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        ← Back to Rookie
                    </Link>
                </div>

                <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="text-lg font-semibold text-zinc-100">Driver Standings</div>
                        <div className="text-sm text-zinc-400">Drivers: {snapshot.standings.length}</div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-[900px] w-full text-sm">
                            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-white/10">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Rank</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Driver</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Starts</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Wins</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Podiums</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Points</th>
                            </tr>
                            </thead>

                            <tbody>
                            {snapshot.standings.map((s, i) => (
                                <tr key={String(s.custId)} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="px-4 py-3 text-zinc-200 font-semibold">{i + 1}</td>
                                    <td className="px-4 py-3 text-zinc-200">{s.name}</td>
                                    <td className="px-4 py-3 text-zinc-200">{s.starts}</td>
                                    <td className="px-4 py-3 text-zinc-200">{s.wins}</td>
                                    <td className="px-4 py-3 text-zinc-200">{s.podiums}</td>
                                    <td className="px-4 py-3 text-zinc-100 font-extrabold">{s.points}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {snapshot.standings.length === 0 && (
                        <div className="px-6 py-6 text-zinc-300">
                            还没有可用的结果数据（请先在 public/rookie/results 放 JSON 并更新 index.json，或导入 DB 结果）。
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
