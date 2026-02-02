import Link from "next/link";
import { rookie, RookieRace } from "@/data/rookie";
import { EventSignupButton } from "@/components/EventSignupButton";
import { deriveSeasonKey, makeEventId } from "@/lib/events/catalog";

/** 是否已结束（基于绝对时间点，UTC → 本地自动换算） */
function isPast(r: RookieRace, now: Date) {
    return new Date(r.start).getTime() < now.getTime();
}

/** 按访问者「本地时区」格式化显示 */
function formatStartLocal(iso: string) {
    const d = new Date(iso);

    return d.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true, // 强制 12 小时制（11:00 PM）
    });
}

export default function RookieSchedulePage() {
    const now = new Date();
    const seasonKey = deriveSeasonKey(rookie.seasonName);

    const races = rookie.races
        .slice()
        .sort(
            (a, b) =>
                new Date(a.start).getTime() - new Date(b.start).getTime()
        );

    const nextRace = races.find((r) => !isPast(r, now)) ?? null;

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <section className="mx-auto max-w-6xl px-6 py-12">
                {/* Header */}
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">
                            {rookie.seriesName} · {rookie.seasonName}
                        </div>
                        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
                            Schedule 赛程
                        </h1>
                        <p className="mt-2 text-zinc-300">
                            时间按访问者本地时区显示
                        </p>
                    </div>

                    <Link
                        href="/rookie"
                        className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        ← Back
                    </Link>
                </div>

                {/* Next race */}
                {nextRace && (
                    <div className="mt-8 rounded-2xl border border-red-500/40 bg-white/5 p-6">
                        <div className="text-xs tracking-widest text-zinc-400">
                            NEXT EVENT
                        </div>
                        <div className="mt-1 text-xl font-semibold">
                            R{nextRace.round} · {nextRace.track}
                        </div>
                        <div className="mt-2 text-sm text-zinc-300">
                            {formatStartLocal(nextRace.start)}
                            {nextRace.format ? ` · ${nextRace.format}` : ""}
                            {nextRace.note ? ` · ${nextRace.note}` : ""}
                        </div>
                    </div>
                )}

                {/* Race list */}
                <div className="mt-8 grid gap-4">
                    {races.map((r) => {
                        const past = isPast(r, now);
                        const isNext = nextRace?.round === r.round;
                        const eventId = makeEventId("rookie", seasonKey, r.round);

                        return (
                            <div
                                key={r.round}
                                className={[
                                    "rounded-2xl border bg-white/5 p-6 transition",
                                    past
                                        ? "border-white/10 opacity-45"
                                        : "border-white/15 hover:bg-white/10",
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
                                            <div className="mt-1 text-lg font-semibold">
                                                {r.track}
                                            </div>
                                            <div className="mt-2 text-sm text-zinc-300">
                                                {formatStartLocal(r.start)}
                                                {r.format ? ` · ${r.format}` : ""}
                                                {r.note ? ` · ${r.note}` : ""}
                                            </div>
                                        </div>
                                    </div>

                                    <span className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold">
                    {past ? "Finished" : "Upcoming"}
                  </span>
                                </div>

                                <div className="mt-4">
                                    <EventSignupButton eventId={eventId} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </main>
    );
}
