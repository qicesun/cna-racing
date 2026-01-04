import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import {
    unwrapIRacingEvent,
    getSession,
    sortByFinishPosition,
    pos1,
    msToClock,
    formatLocal,
} from "@/lib/iracingResult";

type IndexEntry = {
    id: string | number;
    title: string;
    date?: string;
    track?: string; // ✅ 这里写了就优先用
    layout?: string;
    file: string; // "/gt3open/results/preseason_81610301.json"
    cover?: string; // "/gt3open/covers/spa.png"
};

async function readJsonFromPublic<T>(publicPath: string): Promise<T> {
    const full = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    const raw = await fs.readFile(full, "utf-8");
    return JSON.parse(raw) as T;
}

/** 车标：放到 public/gt3open/cars/*.png */
function normalizeCarName(name?: string) {
    return (name ?? "").toLowerCase().trim();
}

const CAR_LOGO_MAP: { key: string; src: string; alt: string }[] = [
    { key: "bmw", src: "/cars/bmw.png", alt: "BMW" },
    { key: "ferrari", src: "/cars/ferrari.png", alt: "Ferrari" },
    { key: "porsche", src: "/cars/porsche.png", alt: "Porsche" },
    { key: "mercedes", src: "/cars/mercedes.png", alt: "Mercedes" },
    { key: "lamborghini", src: "/cars/lamborghini.png", alt: "Lamborghini" },
    { key: "mclaren", src: "/cars/mclaren.png", alt: "McLaren" },
    { key: "chevrolet", src: "/cars/chevrolet.png", alt: "Chevrolet" },
    { key: "ford", src: "/cars/ford.png", alt: "Ford" },
    { key: "aston", src: "/cars/aston.png", alt: "Aston" },
    // 继续加...
];

function getCarLogo(carName?: string) {
    const n = normalizeCarName(carName);
    const hit = CAR_LOGO_MAP.find((m) => n.includes(m.key));
    return hit ?? null;
}

/** iRacing JSON interval 单位是 1/10000 秒（0.1ms） */
function iracingTickToMs(ticks: number) {
    // 1 tick = 0.0001s = 0.1ms
    return Math.round(ticks / 10);
}

/** gap: P1 WIN；P2/P3 显示与 P1 的差距（同组别优先 class_interval） */
function gapDisplay(row: any) {
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

/** 是否已过去（用于视觉标记） */
function isPast(start?: string) {
    if (!start) return false;
    const t = Date.parse(start);
    if (!Number.isFinite(t)) return false;
    return t < Date.now();
}

export default async function GT3ResultsListPage() {
    const index = await readJsonFromPublic<IndexEntry[]>("/gt3open/results/index.json");

    const cards = await Promise.all(
        index.map(async (e) => {
            const id = String(e.id).trim();

            const json = await readJsonFromPublic<any>(e.file);
            const data = unwrapIRacingEvent(json);

            const series = data?.series_name ?? "GT3 Open";
            const start = data?.start_time;
            const finished = isPast(start);

            // ✅ 赛道名优先 index.json 的 track，没有才读 JSON
            const trackName = e.track?.trim() || data?.track?.track_name || "Unknown Track";

            const layout = (e.layout?.trim() ||
                data?.track?.config_name ||
                "Layout") as string;

            const race = data ? getSession(data, "RACE") : null;
            const sorted = race ? sortByFinishPosition(race.results ?? []) : [];
            const top3 = sorted.slice(0, 3);

            return {
                entry: e,
                id,
                series,
                start,
                finished,
                trackName,
                layout,
                top3,
            };
        })
    );

    // start_time 新->旧排序
    cards.sort((a, b) => {
        const ta = a.start ? Date.parse(a.start) : -Infinity;
        const tb = b.start ? Date.parse(b.start) : -Infinity;
        return tb - ta;
    });

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                {/* Title */}
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">CNA GT3 OPEN</div>
                        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                            Results <span className="opacity-90">结果</span>
                        </h1>
                    </div>

                </div>

                {/* Grid */}
                <div className="mt-10 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
                    {cards.map((c) => {
                        const href = `/gt3open/results/${c.id}`;

                        return (
                            <Link
                                key={c.id}
                                href={href}
                                className={[
                                    "block overflow-hidden rounded-[28px] border border-white/10 bg-white/5",
                                    "shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition hover:bg-white/10",
                                    c.finished ? "ring-1 ring-white/5" : "",
                                ].join(" ")}
                            >
                                {/* 1) 顶部图片 */}
                                <div className="relative h-56">
                                    {c.entry.cover ? (
                                        <div
                                            className="absolute inset-0 bg-cover bg-center"
                                            style={{ backgroundImage: `url('${c.entry.cover}')` }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-zinc-800" />
                                    )}
                                </div>

                                {/* 2) 黑色信息区 */}
                                <div className="relative bg-[#121214] px-6 py-5">
                                    <div className="absolute inset-x-0 top-0 h-1 bg-lime-300" />

                                    {/* ✅ 赛道名：比车手名字大，但整体缩小 */}
                                    <div
                                        className="text-[30px] md:text-[34px] font-extrabold tracking-tight text-white leading-[1.05]"
                                        style={{ textShadow: "0 10px 30px rgba(0,0,0,0.55)" }}
                                    >
                                        {(c.trackName ?? "UNKNOWN").replaceAll("-", " ").toUpperCase()}
                                    </div>

                                    <div
                                        className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-white/80"
                                        style={{ textShadow: "0 6px 18px rgba(0,0,0,0.5)" }}
                                    >
                    <span className="inline-flex items-center gap-2">
                      <span>🏁</span>
                      <span>{c.layout}</span>
                    </span>
                                        <span className="inline-flex items-center gap-2">
                      <span>🕒</span>
                      <span>{formatLocal(c.start)}</span>
                    </span>
                                    </div>

                                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-[11px] font-semibold text-white backdrop-blur hover:bg-white/18">
                                        Open full results →
                                    </div>
                                </div>

                                {/* 3) 白色 Top3 */}
                                <div className="bg-white text-zinc-950">
                                    <div className="divide-y divide-zinc-200">
                                        {c.top3.length === 0 ? (
                                            <div className="px-6 py-6 text-sm text-zinc-600">
                                                No RACE results found in JSON
                                                <div className="mt-2 text-xs text-zinc-500">ID: {c.id}</div>
                                            </div>
                                        ) : (
                                            c.top3.map((r: any) => {
                                                const carLogo = getCarLogo(r.car_name);
                                                const gap = gapDisplay(r);

                                                return (
                                                    <div
                                                        key={`${c.id}-${r.cust_id}-${r.finish_position ?? r.position}`}
                                                        className="px-6 py-4 flex items-center justify-between gap-4"
                                                    >
                                                        {/* 左侧：名次 + 名字（更小） */}
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

                                                        {/* ✅ 右侧：车标在时间左边 */}
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
                    <span className="font-medium">
                      {c.finished ? "Finished" : "Upcoming/Running"}
                    </span>
                                        <span className="truncate max-w-[60%]">{c.entry.title}</span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {cards.length === 0 && (
                    <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-8 text-zinc-300">
                        index.json 里还没有任何比赛条目。
                    </div>
                )}
            </div>
        </main>
    );
}
