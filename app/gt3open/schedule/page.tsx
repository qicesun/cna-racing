import Link from "next/link";
import { gt3open, GT3Race } from "@/data/gt3open";
import { EventSignupButton } from "@/components/EventSignupButton";
import LocalTime from "@/components/LocalTime";
import { deriveSeasonKey, makeEventId } from "@/lib/events/catalog";

function isPast(r: GT3Race, now: Date) {
    return new Date(r.start).getTime() < now.getTime();
}

export default function GT3SchedulePage() {
    const now = new Date();
    const seasonKey = deriveSeasonKey(gt3open.seasonName);

    const races = gt3open.races
        .slice()
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const nextRace = races.find((r) => !isPast(r, now)) ?? null;

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <section className="mx-auto max-w-6xl px-6 py-12">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">
                            {gt3open.seriesName} · {gt3open.seasonName}
                        </div>
                        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
                            Schedule 赛程
                        </h1>
                        <p className="mt-2 text-zinc-300">
                            已结束的轮次会自动变灰；下一场会自动高亮。时间会按用户所在时区自动显示。
                        </p>
                    </div>

                    <Link
                        href="/gt3open"
                        className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        ← Back to GT3 Open
                    </Link>
                </div>

                {/* Next race highlight */}
                {nextRace && (
                    <div className="mt-8 rounded-2xl border border-red-500/40 bg-white/5 p-6">
                        <div className="text-xs tracking-widest text-zinc-400">NEXT EVENT</div>
                        <div className="mt-1 text-xl font-semibold">
                            R{nextRace.round} · {nextRace.track}
                        </div>
                        <div className="mt-2 text-sm text-zinc-300">
                            <LocalTime iso={nextRace.start} />
                            {nextRace.format ? ` · ${nextRace.format}` : ""}
                            {nextRace.note ? ` · ${nextRace.note}` : ""}
                        </div>
                    </div>
                )}

                {/* Race cards */}
                <div className="mt-8 grid gap-4">
                    {races.map((r) => {
                        const past = isPast(r, now);
                        const isNext = nextRace?.round === r.round;
                        const eventId = makeEventId("gt3open", seasonKey, r.round);

                        return (
                            <div
                                key={r.round}
                                className={[
                                    "rounded-2xl border bg-white/5 p-6 transition",
                                    past ? "border-white/10 opacity-45" : "border-white/15 hover:bg-white/10",
                                    isNext ? "ring-1 ring-red-500/35" : "",
                                ].join(" ")}
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-1 h-2 w-2 rounded-full bg-red-500/90" />
                                        <div>
                                            <div className="text-xs tracking-widest text-zinc-400">
                                                ROUND {r.round}
                                            </div>
                                            <div className="mt-1 text-lg font-semibold">{r.track}</div>
                                            <div className="mt-2 text-sm text-zinc-300">
                                                <LocalTime iso={r.start} />
                                                {r.format ? ` · ${r.format}` : ""}
                                                {r.note ? ` · ${r.note}` : ""}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {past ? (
                                            <span className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                        Finished
                      </span>
                                        ) : (
                                            <span className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-100">
                        Upcoming
                      </span>
                                        )}

                                        {r.broadcast && (
                                            <a
                                                href={r.broadcast}
                                                className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:opacity-90"
                                            >
                                                Watch
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <EventSignupButton eventId={eventId} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Editing hint */}
                <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-300">
                    <div className="font-semibold text-zinc-100">如何添加新赛程</div>
                    <div className="mt-2">
                        打开{" "}
                        <code className="rounded bg-white/10 px-1.5 py-0.5">data/gt3open.ts</code>，
                        在{" "}
                        <code className="rounded bg-white/10 px-1.5 py-0.5">races</code>{" "}
                        数组里新增一项即可。你现在用的 UTC 格式也很好，比如：{" "}
                        <code className="rounded bg-white/10 px-1.5 py-0.5">2026-01-25T03:59:00Z</code>
                        （会自动换算到用户本地时区）。
                    </div>
                </div>
            </section>
        </main>
    );
}
