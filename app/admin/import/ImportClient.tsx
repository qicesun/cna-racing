"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import LocalTime from "@/components/LocalTime";
import { extractSubsessionIdFromText } from "@/lib/iracing/subsessionId";
import type { Event } from "@/lib/events/catalog";
import type { CnaEventResult } from "@/lib/db/cnaEventResults";
import type { CnaEventSource } from "@/lib/db/cnaEventSources";

type Props = {
    events: Event[];
    sources: CnaEventSource[];
    results: CnaEventResult[];
};

type RowStatus = { loading: boolean; error: string | null; ok: string | null };
type ImportOptions = { force?: boolean; recomputeStandings?: boolean };

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
    const details = json?.details ? ` (${JSON.stringify(json.details)})` : "";
    return (desc ?? err ?? "Unknown error") + details;
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
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkForce, setBulkForce] = useState(false);
    const bulkCancelledRef = useRef(false);

    const setRow = useCallback((eventId: string, patch: Partial<RowStatus>) => {
        setRowStatus((prev) => {
            const current: RowStatus = prev[eventId] ?? { loading: false, error: null, ok: null };
            return {
                ...prev,
                [eventId]: { ...current, ...patch },
            };
        });
    }, []);

    const getSubsessionIdFromInput = useCallback(
        (eventId: string): number | null => {
            const raw = subsessionByEventId[eventId] ?? "";
            return extractSubsessionIdFromText(raw);
        },
        [subsessionByEventId]
    );

    const saveMapping = useCallback(
        async (eventId: string, opts?: { refresh?: boolean }) => {
            const subsessionId = getSubsessionIdFromInput(eventId);
            if (!subsessionId) {
                setRow(eventId, { error: "请输入 subsession_id，或直接粘贴 iRacing 结果链接。", ok: null });
                return;
            }

            setRow(eventId, { loading: true, error: null, ok: null });
            try {
                const { res, json } = await postJson("/api/admin/event-sources", { eventId, subsessionId });
                if (!res.ok) throw new Error(readErr(json));
                setRow(eventId, { ok: "已保存映射。", error: null });
                setSubsessionByEventId((prev) => ({ ...prev, [eventId]: String(subsessionId) }));
                if (opts?.refresh !== false) router.refresh();
            } catch (e) {
                setRow(eventId, { error: e instanceof Error ? e.message : "保存失败。", ok: null });
            } finally {
                setRow(eventId, { loading: false });
            }
        },
        [getSubsessionIdFromInput, router, setRow]
    );

    const importEvent = useCallback(
        async (eventId: string, options?: ImportOptions) => {
            setRow(eventId, { loading: true, error: null, ok: null });
            try {
                const existing = sourcesByEventId.get(eventId) ?? null;
                const inputId = getSubsessionIdFromInput(eventId);

                // Convenience: if mapping is missing or differs from input, save it first.
                if (inputId && (!existing || existing.subsessionId !== inputId)) {
                    const { res, json } = await postJson("/api/admin/event-sources", { eventId, subsessionId: inputId });
                    if (!res.ok) throw new Error(readErr(json));
                    setSubsessionByEventId((prev) => ({ ...prev, [eventId]: String(inputId) }));
                }

                const { res, json } = await postJson("/api/admin/import-event", {
                    eventId,
                    force: options?.force === true,
                    recomputeStandings: options?.recomputeStandings !== false,
                });
                if (!res.ok) throw new Error(readErr(json));
                const count = typeof json?.imported?.count === "number" ? json.imported.count : null;
                setRow(eventId, { ok: count !== null ? `已导入结果（${count} 条）。` : "已导入结果。", error: null });
                if (options?.recomputeStandings !== false) router.refresh();
            } catch (e) {
                setRow(eventId, { error: e instanceof Error ? e.message : "导入失败。", ok: null });
            } finally {
                setRow(eventId, { loading: false });
            }
        },
        [getSubsessionIdFromInput, router, setRow, sourcesByEventId]
    );

    const bulkImportMissing = useCallback(async () => {
        setBulkRunning(true);
        bulkCancelledRef.current = false;

        try {
            const targets = props.events
                .filter((e) => {
                    const hasResult = resultsByEventId.has(e.eventId);
                    if (hasResult) return false;

                    const hasSource = sourcesByEventId.has(e.eventId);
                    const inputId = getSubsessionIdFromInput(e.eventId);
                    return hasSource || !!inputId;
                })
                .sort((a, b) => {
                    if (a.seriesKey !== b.seriesKey) return a.seriesKey.localeCompare(b.seriesKey);
                    if (a.seasonKey !== b.seasonKey) return a.seasonKey.localeCompare(b.seasonKey);
                    return a.round - b.round;
                });

            // Group by series+season to recompute standings once per group.
            const groups = new Map<string, Event[]>();
            for (const e of targets) {
                const key = `${e.seriesKey}:${e.seasonKey}`;
                const arr = groups.get(key) ?? [];
                arr.push(e);
                groups.set(key, arr);
            }

            for (const [, events] of groups) {
                if (bulkCancelledRef.current) break;

                const sorted = events.slice().sort((a, b) => a.round - b.round);
                for (let i = 0; i < sorted.length; i++) {
                    if (bulkCancelledRef.current) break;
                    const e = sorted[i];
                    const recompute = i === sorted.length - 1;
                    // eslint-disable-next-line no-await-in-loop
                    await importEvent(e.eventId, { force: bulkForce, recomputeStandings: recompute });
                }
            }

            router.refresh();
        } finally {
            setBulkRunning(false);
        }
    }, [bulkForce, getSubsessionIdFromInput, importEvent, props.events, resultsByEventId, router, sourcesByEventId]);

    const mappedCount = props.events.filter((e) => sourcesByEventId.has(e.eventId)).length;
    const importedCount = props.events.filter((e) => resultsByEventId.has(e.eventId)).length;
    const missingImportCount = props.events.filter((e) => {
        if (resultsByEventId.has(e.eventId)) return false;
        return sourcesByEventId.has(e.eventId) || !!getSubsessionIdFromInput(e.eventId);
    }).length;

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="text-xs tracking-widest text-zinc-400">EVENTS</div>
                    <div className="mt-2 text-sm text-zinc-300">
                        映射 {mappedCount}/{props.events.length} · 已导入 {importedCount}/{props.events.length} · 可批量导入 {missingImportCount} 场
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                            type="checkbox"
                            checked={bulkForce}
                            onChange={(e) => setBulkForce(e.target.checked)}
                        />
                        强制导入（跳过校验）
                    </label>

                    {!bulkRunning ? (
                        <button
                            type="button"
                            onClick={() => void bulkImportMissing()}
                            disabled={missingImportCount === 0}
                            className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                        >
                            批量导入未导入比赛
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                bulkCancelledRef.current = true;
                            }}
                            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                        >
                            停止批量导入
                        </button>
                    )}
                </div>
            </div>

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
                                            placeholder="subsession_id 或 iRacing 结果链接"
                                            title="subsession_id 或 iRacing 结果链接"
                                            onBlur={() => {
                                                const n = getSubsessionIdFromInput(e.eventId);
                                                if (n) {
                                                    setSubsessionByEventId((prev) => ({ ...prev, [e.eventId]: String(n) }));
                                                }
                                            }}
                                            className="w-72 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/30"
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
                                                onClick={() => void importEvent(e.eventId, { force: false, recomputeStandings: true })}
                                                disabled={s.loading || (!source && !(subsessionByEventId[e.eventId] ?? "").trim())}
                                                className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                                            >
                                                导入
                                            </button>
                                            {s.error && (
                                                <button
                                                    type="button"
                                                    onClick={() => void importEvent(e.eventId, { force: true, recomputeStandings: true })}
                                                    disabled={s.loading}
                                                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                                                >
                                                    强制导入
                                                </button>
                                            )}
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
