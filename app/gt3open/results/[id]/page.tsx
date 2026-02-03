import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import {
    unwrapIRacingEvent,
    getSession,
    sortByFinishPosition,
    formatLocal,
} from "@/lib/iracingResult";
import { getResolvedEventResultByEventId } from "@/lib/results/resolvedEventResults";
import ResultsTabs from "./ResultsTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IndexEntry = {
    id: string | number;
    title: string;
    date?: string;
    track?: string;
    layout?: string;
    file: string;
    cover?: string;
};

async function readJsonFromPublic<T>(publicPath: string): Promise<T> {
    const full = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    const raw = await fs.readFile(full, "utf-8");
    return JSON.parse(raw) as T;
}

export default async function GT3ResultDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const routeId = decodeURIComponent(String(id ?? "")).trim();

    if (routeId.includes(":")) {
        const resolved = await getResolvedEventResultByEventId(routeId);
        if (!resolved || resolved.seriesKey !== "gt3open") {
            return (
                <main className="min-h-screen bg-zinc-950 text-zinc-100">
                    <div className="mx-auto max-w-6xl px-6 py-12">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                            <div className="text-lg font-semibold">Result not found</div>
                            <p className="mt-2 text-zinc-300">
                                还没有这个 round 的结果：<span className="font-semibold">{routeId || "(empty)"}</span>
                            </p>
                            <Link
                                href="/gt3open/results"
                                className="mt-5 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                            >
                                Back to Results
                            </Link>
                        </div>
                    </div>
                </main>
            );
        }

        const data = unwrapIRacingEvent(resolved.rawJson);
        if (!data) {
            return (
                <main className="min-h-screen bg-zinc-950 text-zinc-100">
                    <div className="mx-auto max-w-6xl px-6 py-12">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                            <div className="text-lg font-semibold">Invalid result payload</div>
                            <p className="mt-2 text-zinc-300">
                                解析不到 iRacing 结果结构（event_id：{routeId}）。
                            </p>
                            <Link
                                href="/gt3open/results"
                                className="mt-5 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                            >
                                Back to Results
                            </Link>
                        </div>
                    </div>
                </main>
            );
        }

        const trackName = data?.track?.track_name || "Unknown Track";
        const layout = data?.track?.config_name || "Layout";
        const series = data?.series_name ?? "GT3 Open";
        const start = data?.start_time ?? undefined;

        const quali = getSession(data, "QUALIFY");
        const race = getSession(data, "RACE");

        const raceRows = race ? sortByFinishPosition(race.results ?? []) : [];
        const qualiRows = quali ? sortByFinishPosition(quali.results ?? []) : [];

        return (
            <main className="min-h-screen bg-zinc-950 text-zinc-100">
                <div className="mx-auto max-w-7xl px-6 py-10">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <div className="text-xs tracking-widest text-zinc-400">{series}</div>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                                {trackName} — Full Results
                            </h1>
                            <div className="mt-2 text-sm text-zinc-300">
                                🏁 {layout} <span className="text-zinc-500">·</span> 🕒 {formatLocal(start)}
                                <span className="text-zinc-500"> · </span>
                                <span className="text-zinc-400">Event:</span>{" "}
                                <span className="font-semibold text-zinc-100">{routeId}</span>
                                {resolved.source === "db" && resolved.subsessionId ? (
                                    <>
                                        <span className="text-zinc-500"> · </span>
                                        <span className="text-zinc-400">subsession:</span>{" "}
                                        <span className="font-mono text-zinc-200">{resolved.subsessionId}</span>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        <Link
                            href="/gt3open/results"
                            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                        >
                            ← Back
                        </Link>
                    </div>

                    <ResultsTabs
                        qualiTitle="QUALIFY"
                        raceTitle="RACE"
                        qualiSubtitle={quali?.simsession_type_name ?? "Qualifying"}
                        raceSubtitle={race?.simsession_type_name ?? "Race"}
                        qualiRows={qualiRows}
                        raceRows={raceRows}
                    />
                </div>
            </main>
        );
    }

    const index = await readJsonFromPublic<IndexEntry[]>("/gt3open/results/index.json");
    const entry = index.find((e) => String(e.id).trim() === routeId);

    if (!entry) {
        return (
            <main className="min-h-screen bg-zinc-950 text-zinc-100">
                <div className="mx-auto max-w-6xl px-6 py-12">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="text-lg font-semibold">Result not found</div>
                        <p className="mt-2 text-zinc-300">
                            index.json 里没有这个 id：<span className="font-semibold">{routeId || "(empty)"}</span>
                        </p>
                        <div className="mt-2 text-xs text-zinc-400">
                            Tip: 你现在访问的 URL 应该是 /gt3open/results/&lt;id&gt;
                        </div>
                        <Link
                            href="/gt3open/results"
                            className="mt-5 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                        >
                            Back to Results
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const json = await readJsonFromPublic<any>(entry.file);
    const data = unwrapIRacingEvent(json);

    if (!data) {
        return (
            <main className="min-h-screen bg-zinc-950 text-zinc-100">
                <div className="mx-auto max-w-6xl px-6 py-12">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="text-lg font-semibold">Invalid result file</div>
                        <p className="mt-2 text-zinc-300">解析不到 iRacing 结果结构：{entry.file}</p>
                        <Link
                            href="/gt3open/results"
                            className="mt-5 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                        >
                            Back to Results
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    // ✅ 赛道名优先 index.json 的 track / layout
    const trackName = entry.track?.trim() || data?.track?.track_name || "Unknown Track";
    const layout = entry.layout?.trim() || data?.track?.config_name || "Layout";
    const series = data?.series_name ?? "GT3 Open";
    const start = data?.start_time;

    const quali = getSession(data, "QUALIFY");
    const race = getSession(data, "RACE");

    const raceRows = race ? sortByFinishPosition(race.results ?? []) : [];
    const qualiRows = quali ? sortByFinishPosition(quali.results ?? []) : [];

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                {/* Header */}
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">{series}</div>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                            {trackName} — Full Results
                        </h1>
                        <div className="mt-2 text-sm text-zinc-300">
                            🏁 {layout} <span className="text-zinc-500">·</span> 🕒 {formatLocal(start)}
                            <span className="text-zinc-500"> · </span>
                            <span className="text-zinc-400">ID:</span>{" "}
                            <span className="font-semibold text-zinc-100">{String(entry.id).trim()}</span>
                        </div>
                    </div>

                    <Link
                        href="/gt3open/results"
                        className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        ← Back
                    </Link>
                </div>

                {/* Cover */}
                {entry.cover && (
                    <div className="mt-8 overflow-hidden rounded-3xl border border-white/10">
                        <div
                            className="h-56 md:h-72 bg-cover bg-center"
                            style={{ backgroundImage: `url('${entry.cover}')` }}
                        />
                    </div>
                )}

                {/* Tabs (client) */}
                <ResultsTabs
                    qualiTitle="QUALIFY"
                    raceTitle="RACE"
                    qualiSubtitle={quali?.simsession_type_name ?? "Qualifying"}
                    raceSubtitle={race?.simsession_type_name ?? "Race"}
                    qualiRows={qualiRows}
                    raceRows={raceRows}
                />
            </div>
        </main>
    );
}
