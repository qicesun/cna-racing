import Link from "next/link";

import { EventSignupButton } from "@/components/EventSignupButton";
import LocalTime from "@/components/LocalTime";
import { listAllEvents } from "@/lib/events/catalog";

export const dynamic = "force-dynamic";

export default function SignupPage() {
    const now = new Date();
    const events = listAllEvents();

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <section className="mx-auto max-w-6xl px-6 py-12">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">SIGNUP</div>
                        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
                            报名比赛
                        </h1>
                        <p className="mt-2 text-zinc-300">
                            先用 iRacing 登录，然后按 round 报名/取消。报名名单默认公开。
                        </p>
                    </div>

                    <Link
                        href="/account"
                        className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        去账号页登录
                    </Link>
                </div>

                <div className="mt-8 grid gap-4">
                    {events.map((e) => {
                        const past = new Date(e.start).getTime() < now.getTime();

                        return (
                            <div
                                key={e.eventId}
                                className={[
                                    "rounded-2xl border bg-white/5 p-6 transition",
                                    past ? "border-white/10 opacity-50" : "border-white/15 hover:bg-white/10",
                                ].join(" ")}
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-1 h-2 w-2 rounded-full bg-red-500/90" />
                                        <div>
                                            <div className="text-xs tracking-widest text-zinc-400">
                                                {e.seriesName} · {e.seasonName} · ROUND {e.round}
                                            </div>
                                            <div className="mt-1 text-lg font-semibold">
                                                {e.track}
                                            </div>
                                            <div className="mt-2 text-sm text-zinc-300">
                                                <LocalTime iso={e.start} />
                                                {e.format ? ` · ${e.format}` : ""}
                                                {e.note ? ` · ${e.note}` : ""}
                                            </div>
                                        </div>
                                    </div>

                                    <span className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold">
                                        {past ? "Finished" : "Upcoming"}
                                    </span>
                                </div>

                                <div className="mt-4">
                                    <EventSignupButton eventId={e.eventId} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </main>
    );
}

