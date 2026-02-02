import fs from "fs/promises";
import path from "path";

import DriversClient, { DriverProfile } from "./DriversClient";
import { listCnaUsers } from "@/lib/db/cnaUsers";
import { defaultPoints, normalizeName, pointsForPosition } from "@/lib/points";
import {
    getSession,
    IRacingEventResult,
    IRacingEventResultFile,
    sortByFinishPosition,
    unwrapIRacingEvent,
} from "@/lib/iracingResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IndexEntry = {
    id: string;
    title: string;
    date?: string; // might be missing timezone
    track?: string;
    layout?: string;
    file: string;
    cover?: string;
};

type SeriesSource = {
    key: string;   // ✅ stable ID: gt3open / rookie
    label: string; // display label
    indexPath: string;
};

type LicenseEntry = {
    category?: string;
    category_id?: number;
    irating?: number;
    safety_rating?: number;
};

type LicenseMap = Record<string, LicenseEntry[]>;

type DriverAccumulator = {
    name: string;
    points: number;
    starts: number;
    irating?: number | null;
    safetyRating?: number | null;
    series: Set<string>; // ✅ store series KEYs, not labels
    lastRace?: {
        seriesKey: string;   // ✅ stable
        seriesLabel: string; // display
        track: string;
        dateIso?: string;    // ✅ keep iso for client formatting
        timestamp?: number;
    } | null;
    lastLoginAt?: string | null;
};

async function readJsonFromPublic<T>(publicPath: string): Promise<T | null> {
    try {
        const full = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
        const raw = await fs.readFile(full, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function selectSportsCarLicense(licenses?: LicenseEntry[]) {
    if (!licenses?.length) return null;
    return (
        licenses.find((license) => license.category === "sports_car" || license.category_id === 5) ??
        licenses[0]
    );
}

/**
 * ✅ Always prefer iRacing start_time (has timezone).
 * Only fall back to entry.date if start_time missing.
 */
function getBestTimestamp(entry: IndexEntry, event: IRacingEventResult) {
    const startIso = event?.start_time;
    if (startIso) {
        const t = Date.parse(startIso);
        if (Number.isFinite(t)) return { t, iso: startIso };
    }

    const d = entry.date;
    if (d) {
        const t = Date.parse(d);
        if (Number.isFinite(t)) return { t, iso: d };
    }

    return { t: undefined, iso: undefined };
}

export default async function DriversPage() {
    const sources: SeriesSource[] = [
        { key: "gt3open", label: "GT3 Open", indexPath: "/gt3open/results/index.json" },
        { key: "rookie", label: "Rookie", indexPath: "/rookie/results/index.json" },
    ];

    const drivers = new Map<string, DriverAccumulator>();
    const driversByCustId = new Map<number, DriverAccumulator>();

    for (const source of sources) {
        const index = (await readJsonFromPublic<IndexEntry[]>(source.indexPath)) ?? [];

        for (const entry of index) {
            const json = await readJsonFromPublic<IRacingEventResultFile | any>(entry.file);
            const data = unwrapIRacingEvent(json);
            if (!data) continue;

            const race = getSession(data, "RACE");
            if (!race?.results?.length) continue;

            const rows = sortByFinishPosition(race.results);
            const licenseMap = (data as { driver_licenses?: LicenseMap }).driver_licenses;

            const trackLabel = entry.track?.trim() || data.track?.track_name || "Unknown";
            const { t: raceTimestamp, iso: raceIso } = getBestTimestamp(entry, data);

            rows.forEach((row, indexPos) => {
                const name = normalizeName(row.display_name ?? "Unknown Driver");

                const points =
                    typeof row.champ_points === "number" && Number.isFinite(row.champ_points)
                        ? row.champ_points
                        : pointsForPosition(indexPos + 1, defaultPoints);

                const custId = row.cust_id ? String(row.cust_id) : undefined;
                const custIdNumber = custId && Number.isFinite(Number(custId)) ? Number(custId) : null;
                const license = custId ? selectSportsCarLicense(licenseMap?.[custId]) : null;

                const current =
                    drivers.get(name) ??
                    ({
                        name,
                        points: 0,
                        starts: 0,
                        irating: null,
                        safetyRating: null,
                        series: new Set<string>(),
                        lastRace: null,
                        lastLoginAt: null,
                    } satisfies DriverAccumulator);

                current.points += points;
                current.starts += 1;

                // ✅ store series ID (stable)
                current.series.add(source.key);

                if (license) {
                    current.irating = license.irating ?? current.irating ?? null;
                    current.safetyRating = license.safety_rating ?? current.safetyRating ?? null;
                }

                if (custIdNumber && !driversByCustId.has(custIdNumber)) {
                    driversByCustId.set(custIdNumber, current);
                }

                // ✅ lastRace: use strict ">" so ties don't overwrite randomly
                if (raceTimestamp) {
                    const prev = current.lastRace?.timestamp ?? -Infinity;
                    if (raceTimestamp > prev) {
                        current.lastRace = {
                            seriesKey: source.key,
                            seriesLabel: source.label,
                            track: trackLabel,
                            dateIso: raceIso ?? entry.date ?? data.start_time,
                            timestamp: raceTimestamp,
                        };
                    }
                }

                drivers.set(name, current);
            });
        }
    }

    // Include users who have logged into CNA (but may not have race results yet).
    // This should not break the Drivers page if Supabase is misconfigured or down.
    try {
        const users = await listCnaUsers();

        for (const u of users) {
            const existing = driversByCustId.get(u.iracingCustId) ?? drivers.get(normalizeName(u.iracingName));
            if (existing) {
                existing.lastLoginAt = u.updatedAt;
                continue;
            }

            const name = normalizeName(u.iracingName || "Unknown Driver");
            const acc: DriverAccumulator = {
                name,
                points: 0,
                starts: 0,
                irating: null,
                safetyRating: null,
                series: new Set<string>(),
                lastRace: null,
                lastLoginAt: u.updatedAt,
            };

            drivers.set(name, acc);
            driversByCustId.set(u.iracingCustId, acc);
        }
    } catch (e) {
        console.error("listCnaUsers failed", e);
    }

    const driverList: DriverProfile[] = Array.from(drivers.values()).map((driver) => ({
        name: driver.name,
        points: Math.round(driver.points),
        starts: driver.starts,
        irating: driver.irating ?? null,
        safetyRating: driver.safetyRating ?? null,
        lastLoginAt: driver.lastLoginAt ?? null,

        // ✅ pass series as KEYS (DriversClient can map to labels if you want)
        series: Array.from(driver.series.values()).sort(),

        // ✅ pass lastRace series as LABEL (what you display)
        lastRace: driver.lastRace
            ? {
                series: driver.lastRace.seriesLabel,
                track: driver.lastRace.track,
                date: driver.lastRace.dateIso,
            }
            : null,
    }));

    driverList.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="flex flex-col gap-2">
                    <div className="text-xs tracking-widest text-zinc-400">CNA DRIVERS</div>
                    <h1 className="text-3xl font-semibold tracking-tight">车手名录</h1>
                    <p className="max-w-2xl text-sm text-zinc-400">
                        所有参与过 CNA 比赛的车手都会展示在这里。数据来源于官方结果 JSON。
                    </p>
                </div>

                <DriversClient drivers={driverList} />
            </div>
        </main>
    );
}
