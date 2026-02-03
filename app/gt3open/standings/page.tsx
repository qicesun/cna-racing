import {
    computeSeriesStandings,
} from "@/lib/results/computeSeriesStandings";
import { driverToTeam } from "@/data/teams";
import { gt3open } from "@/data/gt3open";
import { deriveSeasonKey } from "@/lib/events/catalog";
import { listResolvedEventResultsBySeriesSeason } from "@/lib/results/resolvedEventResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DriverStanding = {
    driver: string;
    team: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
};

export default async function GT3OpenStandingsPage() {
    const seriesKey = "gt3open";
    const seasonKey = deriveSeasonKey(gt3open.seasonName);

    // Prefer imported DB results, but fall back to legacy public JSON (matched by start_time).
    const resolved = await listResolvedEventResultsBySeriesSeason({ seriesKey, seasonKey });

    const snapshot = computeSeriesStandings({
        seriesKey,
        seasonKey,
        events: resolved.map((r) => ({ eventId: r.eventId, raceResults: r.raceResults })),
    });

    const drivers = snapshot.standings.map((s) => {
        const team = driverToTeam[s.name] ?? "—";
        return {
            driver: s.name,
            team,
            points: s.points,
            starts: s.starts,
            wins: s.wins,
            podiums: s.podiums,
        } satisfies DriverStanding;
    });

    // --- Team standings (sum of drivers) ---
    const teamMap = new Map<string, { team: string; points: number; wins: number; podiums: number }>();
    for (const d of drivers) {
        const team = d.team || "—";
        const cur = teamMap.get(team) ?? { team, points: 0, wins: 0, podiums: 0 };
        cur.points += d.points;
        cur.wins += d.wins;
        cur.podiums += d.podiums;
        teamMap.set(team, cur);
    }

    const teams = Array.from(teamMap.values())
        .filter((t) => t.team !== "—") // hide unknown team bucket by default
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.podiums !== a.podiums) return b.podiums - a.podiums;
            return a.team.localeCompare(b.team);
        });

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">CNA GT3 OPEN</div>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Standings 积分榜</h1>
                        <div className="mt-2 text-sm text-zinc-400">
                            已计入 {snapshot.eventIds.length} 场比赛（优先 DB 导入结果；缺失时回退 public JSON）。
                        </div>
                    </div>
                </div>

                {/* DRIVER STANDINGS */}
                <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="text-lg font-semibold text-zinc-100">Driver Standings</div>
                        <div className="text-sm text-zinc-400">Drivers: {drivers.length}</div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-[900px] w-full text-sm">
                            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-white/10">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Pos</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Driver</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Team</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Pts</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Starts</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Wins</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Podiums</th>
                            </tr>
                            </thead>
                            <tbody>
                            {drivers.map((d, idx) => (
                                <tr key={d.driver} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="px-4 py-3 text-zinc-200 font-semibold">{idx + 1}</td>
                                    <td className="px-4 py-3 text-zinc-200">{d.driver}</td>
                                    <td className="px-4 py-3 text-zinc-200">{d.team}</td>
                                    <td className="px-4 py-3 text-zinc-200 font-semibold">{d.points}</td>
                                    <td className="px-4 py-3 text-zinc-200">{d.starts}</td>
                                    <td className="px-4 py-3 text-zinc-200">{d.wins}</td>
                                    <td className="px-4 py-3 text-zinc-200">{d.podiums}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {drivers.length === 0 && (
                        <div className="px-6 py-6 text-zinc-300">
                            还没有结果数据。先在 public/gt3open/results 放 JSON 并更新 index.json。
                        </div>
                    )}
                </div>

                {/* TEAM STANDINGS */}
                <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="text-lg font-semibold text-zinc-100">Team Standings</div>
                        <div className="text-sm text-zinc-400">Teams: {teams.length}</div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-[700px] w-full text-sm">
                            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-white/10">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Pos</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Team</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Pts</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Wins</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Podiums</th>
                            </tr>
                            </thead>
                            <tbody>
                            {teams.map((t, idx) => (
                                <tr key={t.team} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="px-4 py-3 text-zinc-200 font-semibold">{idx + 1}</td>
                                    <td className="px-4 py-3 text-zinc-200">{t.team}</td>
                                    <td className="px-4 py-3 text-zinc-200 font-semibold">{t.points}</td>
                                    <td className="px-4 py-3 text-zinc-200">{t.wins}</td>
                                    <td className="px-4 py-3 text-zinc-200">{t.podiums}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {teams.length === 0 && (
                        <div className="px-6 py-6 text-zinc-300">
                            还没有车队数据。请在 data/teams.ts 里添加 “车手→车队” 映射。
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
