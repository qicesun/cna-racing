"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import LocalTime from "@/components/LocalTime";
import type { Event } from "@/lib/events/catalog";
import type { CnaEventResult } from "@/lib/db/cnaEventResults";
import type { CnaEventSource } from "@/lib/db/cnaEventSources";

type Props = {
    events: Event[];
    sources: CnaEventSource[];
    results: CnaEventResult[];
};

type RowStatus = { loading: boolean; error: string | null; ok: string | null };

async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return { res, json };
}

function readErr(json: any): string {
    const desc = typeof json?.error_description === "string" ? json.error_description : null;
    const err = typeof json?.error === "string" ? json.error : null;
    return desc ?? err ?? "Unknown error";
}

export default function ImportClient(props: Props) {
    const router = useRouter();

    const sourcesByEventId = useMemo(() => new Map(props.sources.map((s) => [s.eventId, s])), [props.sources]);
    const resultsByEventId = useMemo(() => new Map(props.results.map((r) => [r.eventId, r])), [props.results]);

    const [subsessionByEventId, setSubsessionByEventId] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const e of props.events) {
            const existing = sourcesByEventId.get(e.eventId);
            init[e.eventId] = existing ? String(existing.subsessionId) : "";
        }
        return init;
    });

    const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});

    const setRow = useCallback((eventId: string, patch: Partial<RowStatus>) => {
        setRowStatus((prev) => {
            const current: RowStatus = prev[eventId] ?? { loading: false, error: null, ok: null };
            return {
                ...prev,
                [eventId]: { ...current, ...patch },
            };
        });
    }, []);

    const saveMapping = useCallback(
        async (eventId: string) => {
            const raw = subsessionByEventId[eventId] ?? "";
            const subsessionId = Number(raw);
            if (!Number.isFinite(subsessionId) || !Number.isInteger(subsessionId) || subsessionId <= 0) {
                setRow(eventId, { error: "请输入有效的 subsession_id（正整数）。", ok: null });
                return;
            }

            setRow(eventId, { loading: true, error: null, ok: null });
            try {
                const { res, json } = await postJson("/api/admin/event-sources", { eventId, subsessionId });
                if (!res.ok) throw new Error(readErr(json));
                setRow(eventId, { ok: "已保存映射。", error: null });
                router.refresh();
            } catch (e) {
                setRow(eventId, { error: e instanceof Error ? e.message : "保存失败。", ok: null });
            } finally {
                setRow(eventId, { loading: false });
            }
        },
        [router, setRow, subsessionByEventId]
    );

    const importEvent = useCallback(
        async (eventId: string) => {
            setRow(eventId, { loading: true, error: null, ok: null });
            try {
                const { res, json } = await postJson("/api/admin/import-event", { eventId });
                if (!res.ok) throw new Error(readErr(json));
                const count = typeof json?.imported?.count === "number" ? json.imported.count : null;
                setRow(eventId, { ok: count !== null ? `已导入结果（${count} 条）。` : "已导入结果。", error: null });
                router.refresh();
            } catch (e) {
                setRow(eventId, { error: e instanceof Error ? e.message : "导入失败。", ok: null });
            } finally {
                setRow(eventId, { loading: false });
            }
        },
        [router, setRow]
    );

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs tracking-widest text-zinc-400">EVENTS</div>

            <div className="mt-3 overflow-x-auto">
                <table className="min-w-[920px] w-full text-sm">
                    <thead className="text-xs text-zinc-400">
                        <tr className="border-b border-white/10">
                            <th className="py-2 text-left font-semibold">Event</th>
                            <th className="py-2 text-left font-semibold">开始时间</th>
                            <th className="py-2 text-left font-semibold">subsession_id</th>
                            <th className="py-2 text-left font-semibold">状态</th>
                            <th className="py-2 text-left font-semibold">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.events.map((e) => {
                            const source = sourcesByEventId.get(e.eventId) ?? null;
                            const result = resultsByEventId.get(e.eventId) ?? null;
                            const s = rowStatus[e.eventId] ?? { loading: false, error: null, ok: null };

                            return (
                                <tr key={e.eventId} className="border-b border-white/5 align-top">
                                    <td className="py-3 pr-3">
                                        <div className="font-semibold text-zinc-100">{e.track}</div>
                                        <div className="mt-1 text-xs text-zinc-500 font-mono">{e.eventId}</div>
                                        <div className="mt-1 text-xs text-zinc-500">
                                            {e.seriesName} · {e.seasonName} · Round {e.round}
                                        </div>
                                    </td>

                                    <td className="py-3 pr-3 text-zinc-200">
                                        <LocalTime iso={e.start} />
                                    </td>

                                    <td className="py-3 pr-3">
                                        <input
                                            value={subsessionByEventId[e.eventId] ?? ""}
                                            onChange={(ev) =>
                                                setSubsessionByEventId((prev) => ({
                                                    ...prev,
                                                    [e.eventId]: ev.target.value,
                                                }))
                                            }
                                            placeholder="例如 83007142"
                                            className="w-44 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/30"
                                        />
                                    </td>

                                    <td className="py-3 pr-3">
                                        <div className="text-xs text-zinc-400">
                                            映射:{" "}
                                            {source ? (
                                                <span className="text-zinc-200">已配置</span>
                                            ) : (
                                                <span className="text-zinc-500">未配置</span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-400">
                                            结果:{" "}
                                            {result ? (
                                                <span className="text-zinc-200">
                                                    已导入（<LocalTime iso={result.fetchedAt} />）
                                                </span>
                                            ) : (
                                                <span className="text-zinc-500">未导入</span>
                                            )}
                                        </div>

                                        {s.error && <div className="mt-2 text-xs text-red-300">{s.error}</div>}
                                        {s.ok && <div className="mt-2 text-xs text-emerald-300">{s.ok}</div>}
                                    </td>

                                    <td className="py-3">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void saveMapping(e.eventId)}
                                                disabled={s.loading}
                                                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                                            >
                                                保存映射
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void importEvent(e.eventId)}
                                                disabled={s.loading || !(subsessionByEventId[e.eventId] ?? "").trim()}
                                                className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                                            >
                                                导入
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
