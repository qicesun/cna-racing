import DriversClient, { type DriverProfile } from "./DriversClient";
import { listCnaUsers } from "@/lib/db/cnaUsers";
import { listDriverStatsFromResults } from "@/lib/drivers/stats";
import { listCachedIracingSportsCarRatings } from "@/lib/iracing/memberInfoCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DriversPage() {
    // Canonical CNA stats: DB-imported official results first; fallback to legacy public JSON when missing.
    const stats = await listDriverStatsFromResults().catch((e) => {
        console.error("listDriverStatsFromResults failed", e);
        return [];
    });

    const byCustId = new Map<number, DriverProfile>();

    for (const s of stats) {
        byCustId.set(s.iracingCustId, {
            iracingCustId: s.iracingCustId,
            name: s.name,
            points: s.points,
            starts: s.starts,
            irating: s.irating,
            safetyRating: s.safetyRating,
            lastLoginAt: null,
            series: s.series,
            lastRace: s.lastRace ?? null,
        });
    }

    // Include users who have logged into CNA (but may not have race results yet).
    try {
        const users = await listCnaUsers();
        for (const u of users) {
            const existing = byCustId.get(u.iracingCustId);
            if (existing) {
                existing.lastLoginAt = u.updatedAt;
                continue;
            }

            byCustId.set(u.iracingCustId, {
                iracingCustId: u.iracingCustId,
                name: u.iracingName || "Unknown Driver",
                points: 0,
                starts: 0,
                irating: null,
                safetyRating: null,
                lastLoginAt: u.updatedAt,
                series: [],
                lastRace: null,
            });
        }
    } catch (e) {
        console.error("listCnaUsers failed", e);
    }

    const driverList = Array.from(byCustId.values());

    // Prefer cached iRacing Sports Car iR/SR (from Data API) when available.
    // Never triggers refresh here to keep /drivers cheap; refresh happens on /account and /drivers/[custId].
    try {
        const ids = driverList
            .map((d) => d.iracingCustId)
            .filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0);

        const ratings = await listCachedIracingSportsCarRatings(ids);
        for (const d of driverList) {
            const id = d.iracingCustId;
            if (typeof id !== "number") continue;
            const r = ratings.get(id);
            if (!r) continue;

            if (r.irating !== null) d.irating = r.irating;
            if (r.safetyRating !== null) d.safetyRating = r.safetyRating;
        }
    } catch (e) {
        console.error("listCachedIracingSportsCarRatings failed", e);
    }

    driverList.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="flex flex-col gap-2">
                    <div className="text-xs tracking-widest text-zinc-400">CNA DRIVERS</div>
                    <h1 className="text-3xl font-semibold tracking-tight">车手名录</h1>
                    <p className="max-w-2xl text-sm text-zinc-400">
                        所有参与过 CNA 比赛的车手都会展示在这里。积分/参赛次数优先来自 DB 导入的 iRacing
                        官方结果，缺失时回退到 public JSON。
                    </p>
                </div>

                <DriversClient drivers={driverList} />
            </div>
        </main>
    );
}

