import Link from "next/link";

import ProfileEditor from "@/components/ProfileEditor";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getCnaUserProfile } from "@/lib/db/cnaUserProfiles";
import { getDriverStatsFromResultsByCustId } from "@/lib/drivers/stats";
import type { EditableUserProfile } from "@/lib/user/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
    // Next.js 16+ provides searchParams as a Promise in server components.
    searchParams?: Promise<SearchParams>;
};

function readParam(searchParams: SearchParams | undefined, key: string): string | null {
    const v = searchParams?.[key];
    if (!v) return null;
    return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AccountPage({ searchParams }: Props) {
    const user = await getCurrentUser();
    const sp = await searchParams;
    const error = readParam(sp, "error");
    const errorDescription = readParam(sp, "error_description");

    let profile: EditableUserProfile | null = null;
    let stats: Awaited<ReturnType<typeof getDriverStatsFromResultsByCustId>> | null = null;

    if (user) {
        try {
            const row = await getCnaUserProfile(user.iracingCustId);
            profile = row
                ? {
                    nickname: row.nickname,
                    discord: row.discord,
                    bio: row.bio,
                    preferredCar: row.preferredCar,
                    carNumber: row.carNumber,
                    links: row.links,
                }
                : null;
        } catch {
            profile = null;
        }

        try {
            stats = await getDriverStatsFromResultsByCustId(user.iracingCustId);
        } catch {
            stats = null;
        }
    }

    const initialProfile: EditableUserProfile = profile ?? {
        nickname: null,
        discord: null,
        bio: null,
        preferredCar: null,
        carNumber: null,
        links: [],
    };

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-3xl px-6 py-12">
                <div className="flex flex-col gap-2">
                    <div className="text-xs tracking-widest text-zinc-400">ACCOUNT</div>
                    <h1 className="text-3xl font-semibold tracking-tight">账号</h1>
                    <p className="text-sm text-zinc-400">
                        使用 iRacing OAuth 登录以便后续报名比赛、查看报名名单以及耐力赛组队。
                    </p>
                </div>

                {error && (
                    <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                        <div className="text-sm font-semibold text-red-200">
                            登录失败：{error}
                        </div>
                        {errorDescription && (
                            <div className="mt-1 text-sm text-red-200/80">
                                {errorDescription}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
                    {user ? (
                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="text-sm text-zinc-400">当前已登录</div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                    {user.iracingName}
                                </div>
                                <div className="mt-1 text-sm text-zinc-400">
                                    iRacing Cust ID:{" "}
                                    <span className="font-mono text-zinc-200">
                                        {user.iracingCustId}
                                    </span>
                                </div>
                            </div>

                            {stats && (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
                                    <div className="text-xs tracking-widest text-zinc-400">CNA STATS</div>
                                    <div className="mt-2 grid gap-1">
                                        <div>积分: {stats.points}</div>
                                        <div>参赛次数: {stats.starts}</div>
                                        <div>iRating: {stats.irating ?? "—"}</div>
                                        <div>SR: {stats.safetyRating ?? "—"}</div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                <Link
                                    href={`/drivers/${user.iracingCustId}`}
                                    className="inline-flex w-fit rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                                >
                                    查看我的公开主页
                                </Link>

                                <a
                                    href="/logout?next=/account"
                                    className="inline-flex w-fit rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                                >
                                    退出登录
                                </a>
                            </div>

                            <ProfileEditor initialProfile={initialProfile} />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="text-sm text-zinc-300">
                                你尚未登录。点击下方按钮跳转到 iRacing 完成授权。
                            </div>
                            <Link
                                href="/oauth/login?next=/account"
                                className="inline-flex w-fit rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                            >
                                使用 iRacing 登录
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
