import Link from "next/link";

import { rookie } from "@/data/rookie";
import { deriveSeasonKey, getEventById, listAllEvents } from "@/lib/events/catalog";
import {
    unwrapIRacingEvent,
    getSession,
    sortByFinishPosition,
    pos1,
    msToClock,
    formatLocal,
} from "@/lib/iracingResult";
import { getResolvedEventResultByEventId, listResolvedEventResultsBySeriesSeason } from "@/lib/results/resolvedEventResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeCarName(name?: string) {
    return (name ?? "").toLowerCase().trim();
}

// 车标：放到 public/cars/*.png （你 GT3 已经用过这套）
// 你也可以改成 /rookie/cars/xxx.png
const CAR_LOGO_MAP: { key: string; src: string; alt: string }[] = [
    { key: "mazda", src: "/cars/mazda.png", alt: "Mazda" },
    { key: "mx-5", src: "/cars/mazda.png", alt: "Mazda" },
    { key: "GR86", src: "/cars/toyota.svg", alt: "Toyota" },
    { key: "toyota", src: "/cars/toyota.svg", alt: "Toyota" },
];

function getCarLogo(carName?: string) {
    const n = normalizeCarName(carName);
    const hit = CAR_LOGO_MAP.find((m) => n.includes(m.key));
    return hit ?? null;
}

/** iRacing JSON interval 常见是 tick=1/10000秒（0.1ms） */
function timeAnyToMs(v: unknown): number | null {
    if (typeof v !== "number") return null;
    if (!Number.isFinite(v) || v <= 0) return v === 0 ? 0 : null;

    // heuristic:
    // - 如果很小（< 100000），很多时候是 “秒”
    // - 否则按 tick(1/10000s) 处理
    if (v < 100000) return Math.round(v * 1000);
    return Math.round(v / 10); // tick -> ms
}

/** iRacing JSON interval 单位是 1/10000 秒（0.1ms） */
function iracingTickToMs(ticks: number) {
    // 1 tick = 0.0001s = 0.1ms
    return Math.round(ticks / 10);
}

/** gap: P1 WIN；P2/P3 显示与 P1 的差距（同组别优先 class_interval） */
function gapToLeaderDisplay(row: any) {
    if (!row) return "—";

    const ci = typeof row.class_interval === "number" ? row.class_interval : null;
    const iv = typeof row.interval === "number" ? row.interval : null;
    const ticks = ci ?? iv;

    if (ticks === null) return "—";
    if (ticks === -1) return "—";
    if (ticks === 0) return "WIN";

    const ms = iracingTickToMs(ticks);
    return `+${msToClock(ms)}`;
}

function isPast(start?: string) {
    if (!start) return false;
    const t = Date.parse(start);
    if (!Number.isFinite(t)) return false;
    return t < Date.now();
}

export default async function RookieResultsListPage() {
    const seriesKey = "rookie";
    const seasonKey = deriveSeasonKey(rookie.seasonName);

    const seasonEvents = listAllEvents()
        .filter((e) => e.seriesKey === seriesKey && e.seasonKey === seasonKey)
        .sort((a, b) => a.round - b.round);

    const resolved = await listResolvedEventResultsBySeriesSeason({ seriesKey, seasonKey });
    const resolvedByEventId = new Map(resolved.map((r) => [r.eventId, r]));

    const cards: Array<{
        eventId: string;
        title: string;
        series: string;
        start: string | null;
        finished: boolean;
        trackName: string;
        layout: string;
        cover: string | null;
        top3: any[];
    }> = (
        await Promise.all(
            resolved.map(async (r) => {
                const full = await getResolvedEventResultByEventId(r.eventId);
                if (!full) return null;

                const event = getEventById(r.eventId);
                const cover = event?.cover ?? null;

                const data = unwrapIRacingEvent(full.rawJson);
                if (!data) return null;

                const series = data?.series_name ?? event?.seriesName ?? "CNA ???";
                const start = data?.start_time ?? full.startTime ?? event?.start ?? null;
                const finished = isPast(start ?? undefined);

                const trackName = data?.track?.track_name ?? event?.track ?? full.trackName ?? "Unknown Track";
                const layout = data?.track?.config_name ?? "Layout";

                const race = getSession(data, "RACE");
                const sorted = race ? sortByFinishPosition(race.results ?? []) : [];
                const top3 = sorted.slice(0, 3);

                return {
                    eventId: r.eventId,
                    title: event ? event.seriesName + " | Round " + event.round + " | " + event.track : r.eventId,
                    series,
                    start,
                    finished,
                    trackName,
                    layout,
                    cover,
                    top3,
                };
            })
        )
    ).filter((c): c is NonNullable<typeof c> => Boolean(c));

    // start_time 新->旧
    cards.sort((a, b) => {
        const ta = a.start ? Date.parse(a.start) : -Infinity;
        const tb = b.start ? Date.parse(b.start) : -Infinity;
        return tb - ta;
    });

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">CNA ROOKIE</div>
                        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                            Results <span className="opacity-90">结果</span>
                        </h1>

                    </div>

                    <Link
                        href="/rookie"
                        className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        ← Back to Rookie
                    </Link>
                </div>

                {/* Round-based results (DB-first) */}
                <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="text-lg font-semibold text-zinc-100">按 Round 查看结果</div>
                        <div className="text-sm text-zinc-400">
                            优先 DB 导入 · 缺失回退 public JSON
                        </div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-[900px] w-full text-sm">
                            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-white/10">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Round</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Track</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Start</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Source</th>
                                <th className="px-4 py-3 text-left font-semibold text-zinc-200">Top 3</th>
                                <th className="px-4 py-3 text-right font-semibold text-zinc-200">Link</th>
                            </tr>
                            </thead>
                            <tbody>
                            {seasonEvents.map((e) => {
                                const r = resolvedByEventId.get(e.eventId) ?? null;
                                const top3 = r?.raceResults?.results?.slice?.(0, 3) ?? [];

                                return (
                                    <tr key={e.eventId} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="px-4 py-3 text-zinc-200 font-semibold">{e.round}</td>
                                        <td className="px-4 py-3 text-zinc-200">
                                            <div className="flex items-center gap-3">
                                                {e.cover ? (
                                                    <img
                                                        src={e.cover}
                                                        alt={e.track}
                                                        className="h-10 w-[64px] rounded-md object-cover opacity-90"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="h-10 w-[64px] rounded-md bg-white/10" />
                                                )}
                                                <span className="truncate">{e.track}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-200">{formatLocal(e.start)}</td>
                                        <td className="px-4 py-3 text-zinc-200">
                                            {r ? (r.source === "db" ? "DB" : "JSON") : <span className="text-zinc-500">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-200">
                                            {top3.length ? (
                                                <span className="truncate block max-w-[520px]">
                                                    {top3.map((x: any, idx: number) => `#${idx + 1} ${x?.name ?? "—"}`).join(" · ")}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {r ? (
                                                <Link
                                                    href={`/rookie/results/${encodeURIComponent(e.eventId)}`}
                                                    className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                                                >
                                                    详情 →
                                                </Link>
                                            ) : (
                                                <span className="text-xs text-zinc-500">未导入</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-10 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
                    {cards.map((c) => {
                        const href = `/rookie/results/${encodeURIComponent(c.eventId)}`;

                        return (
                            <Link
                                key={c.eventId}
                                href={href}
                                className={[
                                    "block overflow-hidden rounded-[28px] border border-white/10 bg-white/5",
                                    "shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition hover:bg-white/10",
                                    c.finished ? "ring-1 ring-white/5" : "",
                                ].join(" ")}
                            >
                                {/* Top image */}
                                <div className="relative h-56">
                                    {c.cover ? (
                                        <div
                                            className="absolute inset-0 bg-cover bg-center"
                                            style={{ backgroundImage: `url('${c.cover}')` }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-zinc-800" />
                                    )}
                                </div>

                                {/* Middle info */}
                                <div className="relative bg-[#121214] px-6 py-5">
                                    <div className="absolute inset-x-0 top-0 h-1 bg-red-500" />

                                    <div
                                        className="text-[30px] md:text-[34px] font-extrabold tracking-tight text-white leading-[1.05]"
                                        style={{ textShadow: "0 10px 30px rgba(0,0,0,0.55)" }}
                                    >
                                        {(c.trackName ?? "UNKNOWN").replaceAll("-", " ").toUpperCase()}
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-white/80">
                    <span className="inline-flex items-center gap-2">
                      <span>🏁</span>
                      <span>{c.layout}</span>
                    </span>
                                        <span className="inline-flex items-center gap-2">
                      <span>🕒</span>
                      <span>{formatLocal(c.start ?? undefined)}</span>
                    </span>
                                    </div>

                                    <div className="mt-4 inline-flex items-center rounded-full bg-white/12 px-4 py-2 text-[11px] font-semibold text-white hover:bg-white/18">
                                        Open full results →
                                    </div>
                                </div>

                                {/* Bottom Top3 */}
                                <div className="bg-white text-zinc-950">
                                    <div className="divide-y divide-zinc-200">
                                        {c.top3.length === 0 ? (
                                            <div className="px-6 py-6 text-sm text-zinc-600">
                                                No RACE results found
                                                <div className="mt-2 text-xs text-zinc-500">ID: {c.eventId}</div>
                                            </div>
                                        ) : (
                                            c.top3.map((r: any) => {
                                                const carLogo = getCarLogo(r.car_name);
                                                const gap = gapToLeaderDisplay(r);

                                                return (
                                                    <div
                                                        key={`${c.eventId}-${r.cust_id}-${r.finish_position ?? r.position}`}
                                                        className="px-6 py-4 flex items-center justify-between gap-4"
                                                    >
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className="w-8 text-center text-[26px] font-extrabold text-zinc-900">
                                                                {pos1(r)}
                                                            </div>

                                                            <div className="min-w-0">
                                                                <div className="truncate text-[18px] font-semibold text-zinc-900">
                                                                    {r.display_name ?? "Driver"}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 flex items-center justify-center">
                                                                {carLogo ? (
                                                                    <img
                                                                        src={carLogo.src}
                                                                        alt={carLogo.alt}
                                                                        className="h-6 w-auto opacity-95"
                                                                    />
                                                                ) : (
                                                                    <div className="h-6 w-6 rounded-full bg-zinc-200" />
                                                                )}
                                                            </div>

                                                            <div className="text-right font-mono text-[26px] font-extrabold text-zinc-900">
                                                                {gap}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    <div className="px-6 py-3 text-[12px] text-zinc-600 flex items-center justify-between">
                                        <span className="font-medium">{c.finished ? "Finished" : "Upcoming/Running"}</span>
                                        <span className="truncate max-w-[60%]">{c.title}</span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {cards.length === 0 && (
                    <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-8 text-zinc-300">
                        ??????????????? DB ??? public JSON??
                    </div>
                )}
            </div>
        </main>
    );
}
