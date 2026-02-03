import Link from "next/link";
import { notFound } from "next/navigation";

import LocalTime from "@/components/LocalTime";
import { getCnaUserByCustId } from "@/lib/db/cnaUsers";
import { getCnaUserProfile } from "@/lib/db/cnaUserProfiles";
import { aggregateDriverCnaSeasonStats, listDriverCnaSeasonStatsFromDb } from "@/lib/drivers/cnaSeasonStats";
import { getDriverStatsFromResultsByCustId } from "@/lib/drivers/stats";
import { getOrRefreshIracingMemberInfo } from "@/lib/iracing/memberInfoCache";
import { selectSportsCarLicense } from "@/lib/iracing/memberInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
    params: { custId: string } | Promise<{ custId: string }>;
};

function safeNumber(value: string): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
}

export default async function DriverProfilePage({ params }: Props) {
    const rawCustId = (await Promise.resolve(params)).custId;
    const custId = safeNumber(rawCustId);
    if (!custId) notFound();

    const [cnaUser, profile, stats, dbSeasonStats, memberInfo] = await Promise.all([
        getCnaUserByCustId(custId).catch(() => null),
        getCnaUserProfile(custId).catch(() => null),
        getDriverStatsFromResultsByCustId(custId).catch(() => null),
        listDriverCnaSeasonStatsFromDb(custId).catch(() => []),
        // Allow public visits to trigger refresh when cached data is stale.
        getOrRefreshIracingMemberInfo(custId, { refresh: true }).catch(() => null),
    ]);

    if (!cnaUser && !stats && dbSeasonStats.length === 0) notFound();

    const dbAgg = aggregateDriverCnaSeasonStats(dbSeasonStats);

    const displayName = profile?.nickname ?? cnaUser?.iracingName ?? stats?.name ?? dbAgg.name ?? "Driver";
    const iracingName = cnaUser?.iracingName ?? stats?.name ?? dbAgg.name ?? null;
    const sportsCarLicense = memberInfo ? selectSportsCarLicense(memberInfo.info.licenses) : null;

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <section className="mx-auto max-w-4xl px-6 py-12">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-xs tracking-widest text-zinc-400">DRIVER PROFILE</div>
                        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">{displayName}</h1>
                        <div className="mt-2 text-sm text-zinc-300">
                            iRacing Cust ID: <span className="font-mono">{custId}</span>
                        </div>
                        {iracingName && iracingName !== displayName && (
                            <div className="mt-1 text-sm text-zinc-400">
                                iRacing Name: <span className="font-semibold text-zinc-200">{iracingName}</span>
                            </div>
                        )}
                    </div>

                    <Link
                        href="/drivers"
                        className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                    >
                        返回车手名录
                    </Link>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="text-xs tracking-widest text-zinc-400">CNA STATS</div>
                        {stats || dbSeasonStats.length ? (
                            <div className="mt-3 grid gap-2 text-sm text-zinc-200">
                                <div>积分: {dbSeasonStats.length ? dbAgg.points : stats?.points ?? 0}</div>
                                <div>参赛次数: {dbSeasonStats.length ? dbAgg.starts : stats?.starts ?? 0}</div>
                                <div>iRating: {sportsCarLicense?.irating ?? stats?.irating ?? "—"}</div>
                                <div>SR: {sportsCarLicense?.safetyRating ?? stats?.safetyRating ?? "—"}</div>
                                {stats?.lastRace?.date && (
                                    <div className="text-zinc-300">
                                        最近参赛: {stats.lastRace.series} · {stats.lastRace.track} ·{" "}
                                        <LocalTime iso={stats.lastRace.date} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-3 text-sm text-zinc-400">暂无联赛成绩数据。</div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="text-xs tracking-widest text-zinc-400">PROFILE</div>
                        <div className="mt-3 grid gap-3 text-sm text-zinc-200">
                            {profile?.discord && (
                                <div>
                                    Discord: <span className="font-semibold">{profile.discord}</span>
                                </div>
                            )}
                            {profile?.preferredCar && (
                                <div>
                                    常用车: <span className="font-semibold">{profile.preferredCar}</span>
                                </div>
                            )}
                            {profile?.carNumber && (
                                <div>
                                    号码: <span className="font-mono font-semibold">{profile.carNumber}</span>
                                </div>
                            )}
                            {profile?.bio && (
                                <div>
                                    <div className="text-zinc-400">简介</div>
                                    <div className="mt-1 whitespace-pre-wrap text-zinc-200">{profile.bio}</div>
                                </div>
                            )}
                            {profile?.links?.length ? (
                                <div>
                                    <div className="text-zinc-400">外链</div>
                                    <div className="mt-2 grid gap-2">
                                        {profile.links.map((l) => (
                                            <a
                                                key={`${l.label}:${l.url}`}
                                                href={l.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex w-fit rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10"
                                            >
                                                {l.label}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-zinc-400">该车手尚未填写公开资料。</div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="text-xs tracking-widest text-zinc-400">IRACING DATA</div>
                        {memberInfo ? (
                            <div className="mt-3 grid gap-2 text-sm text-zinc-200">
                                {sportsCarLicense ? (
                                    <>
                                        <div>
                                            Sports Car iRating:{" "}
                                            <span className="font-semibold">
                                                {sportsCarLicense.irating ?? "—"}
                                            </span>
                                        </div>
                                        <div>
                                            Sports Car SR:{" "}
                                            <span className="font-semibold">
                                                {sportsCarLicense.safetyRating ?? "—"}
                                            </span>
                                        </div>
                                        {sportsCarLicense.licenseClass && (
                                            <div>
                                                License:{" "}
                                                <span className="font-semibold">
                                                    {sportsCarLicense.licenseClass}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-zinc-400">暂无可用的 iRacing 许可信息。</div>
                                )}

                                <div className="text-xs text-zinc-500">
                                    更新于: <LocalTime iso={memberInfo.fetchedAt} />{" "}
                                    {memberInfo.stale ? <span>(可能已过期)</span> : null}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 text-sm text-zinc-400">
                                该车手尚未连接 iRacing 高级授权，或暂时无法读取官方数据。
                            </div>
                        )}
                    </div>
                </div>

                {cnaUser?.updatedAt && (
                    <div className="mt-6 text-xs text-zinc-500">
                        最近登录: <LocalTime iso={cnaUser.updatedAt} />
                    </div>
                )}
            </section>
        </main>
    );
}
