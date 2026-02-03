import Link from "next/link";
import { notFound } from "next/navigation";

import ImportClient from "./ImportClient";
import { getAdminUser } from "@/lib/auth/admin";
import { listAllEvents } from "@/lib/events/catalog";
import { listCnaEventResults } from "@/lib/db/cnaEventResults";
import { listCnaEventSources } from "@/lib/db/cnaEventSources";
import type { CnaEventResult } from "@/lib/db/cnaEventResults";
import type { CnaEventSource } from "@/lib/db/cnaEventSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
    const admin = await getAdminUser();
    if (!admin) notFound();

    const events = listAllEvents();

    let sources: CnaEventSource[] = [];
    let results: CnaEventResult[] = [];
    let loadError: string | null = null;

    try {
        sources = await listCnaEventSources(2000);
        results = await listCnaEventResults(2000);
    } catch (e) {
        loadError = e instanceof Error ? e.message : "Unknown error";
        sources = [];
        results = [];
    }

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-6xl px-6 py-10">
                <div className="flex flex-col gap-2">
                    <div className="text-xs tracking-widest text-zinc-400">ADMIN</div>
                    <h1 className="text-3xl font-semibold tracking-tight">导入比赛结果</h1>
                    <p className="max-w-3xl text-sm text-zinc-400">
                        这里用于把 CNA 的 <span className="font-mono">event_id</span>（例如{" "}
                        <span className="font-mono">gt3open:26S1:8</span>）手动映射到 iRacing 的{" "}
                        <span className="font-mono">subsession_id</span>，并从 iRacing Data API 拉取结果、保存 raw JSON
                        与积分榜快照。
                    </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <Link
                        href="/account"
                        className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                    >
                        去账号页连接 iRacing 高级授权
                    </Link>
                    <span className="text-zinc-500">
                        当前管理员: {admin.iracingName} ({admin.iracingCustId})
                    </span>
                </div>

                {loadError && (
                    <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                        读取 Supabase 数据失败：{loadError}
                    </div>
                )}

                <div className="mt-8">
                    <ImportClient events={events} sources={sources} results={results} />
                </div>
            </div>
        </main>
    );
}
