import Link from "next/link";
import { notFound } from "next/navigation";

import { EventSignupButton } from "@/components/EventSignupButton";
import DriverLink from "@/components/DriverLink";
import LocalTime from "@/components/LocalTime";
import { getEventById, normalizeEventId } from "@/lib/events/catalog";
import { getResolvedEventResultByEventId } from "@/lib/results/resolvedEventResults";
import { getSignupStore } from "@/lib/signup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
    params: { eventId: string } | Promise<{ eventId: string }>;
};

export default async function EventPage({ params }: Props) {
    const rawEventId = (await Promise.resolve(params)).eventId;
    const eventId = normalizeEventId(rawEventId);
    const event = getEventById(eventId);
    if (!event) notFound();

    const store = getSignupStore();
    const signups = await store.listSignupsForEvent(eventId);

    const result = await getResolvedEventResultByEventId(eventId);
    const resultHref = `/${event.seriesKey}/results/${encodeURIComponent(event.eventId)}`;

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <section className="mx-auto max-w-4xl px-6 py-12">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">
                            {event.seriesName} · {event.seasonName} · ROUND {event.round}
                        </div>
                        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
                            {event.track}
                        </h1>
                        <div className="mt-2 text-sm text-zinc-300">
                            <LocalTime iso={event.start} />
                            {event.format ? ` · ${event.format}` : ""}
                            {event.note ? ` · ${event.note}` : ""}
                        </div>
                    </div>

                    <Link
                        href="/signup"
                        className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        返回报名列表
                    </Link>
                </div>

                <div className="mt-6">
                    <EventSignupButton eventId={event.eventId} />
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs tracking-widest text-zinc-400">RESULTS</div>
                        {result ? (
                            <Link
                                href={resultHref}
                                className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                            >
                                查看完整结果 →
                            </Link>
                        ) : null}
                    </div>

                    {result ? (
                        <div className="mt-3 grid gap-1 text-sm text-zinc-200">
                            <div>
                                状态:{" "}
                                <span className="font-semibold">
                                    {result.source === "db" ? "已导入（DB）" : "已存在（public JSON）"}
                                </span>
                            </div>
                            <div>
                                参赛人数:{" "}
                                <span className="font-semibold">
                                    {result.raceResults.results.length}
                                </span>
                            </div>
                            {result.source === "db" && (
                                <div className="text-xs text-zinc-500">
                                    subsession_id: <span className="font-mono">{result.subsessionId ?? "—"}</span>
                                    {" · "}
                                    更新于: <LocalTime iso={result.fetchedAt ?? ""} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mt-3 text-sm text-zinc-400">
                            暂无结果数据（尚未导入或未发布）。
                        </div>
                    )}
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="text-xs tracking-widest text-zinc-400">SIGNUPS</div>
                    <div className="mt-2 text-sm text-zinc-300">
                        共 {signups.length} 人已报名（名单公开）。
                    </div>

                    <div className="mt-4 grid gap-2">
                        {signups.length === 0 ? (
                            <div className="text-sm text-zinc-400">暂无报名。</div>
                        ) : (
                            signups.map((s) => (
                                <div
                                    key={`${s.user.iracingCustId}`}
                                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                                >
                                    <DriverLink
                                        custId={s.user.iracingCustId}
                                        name={s.user.iracingName}
                                        className="font-semibold text-zinc-100 hover:underline"
                                    />
                                    <div className="text-xs text-zinc-400 font-mono">
                                        {s.user.iracingCustId}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}
