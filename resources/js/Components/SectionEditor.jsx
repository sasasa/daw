import React from 'react';
import { router } from '@inertiajs/react';
import { sectionRanges, measureStartSeconds, measureDurationSeconds, nearestSection } from '../lib/sections';
import api from '../lib/api';

// 曲構成（Aメロ等）の編集。ドラム・構成は自動保存され、ボタン押下は不要。
// 並べ替え/複製/削除はドラム小節と録音もまとめて操作する。
export default function SectionEditor({
    songId,
    sections,
    onChange,
    pattern,
    onPatternChange,
    bpm,
    audioTracks,
    onPlayOnly,
    onPlayFrom,
    onAudioChanged,
}) {
    const totalMeasures = pattern.length;
    const ranges = sectionRanges(sections);
    const assigned = ranges.reduce((sum, r) => sum + r.measures, 0);

    const update = (id, key, value) =>
        onChange(sections.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

    // 録音側の更新（複製/削除/移動）を axios で実行し、完了後に録音一覧だけ再読込する。
    // クライアントの状態（ドラム・構成）は保持したまま audioTracks プロップだけ更新される。
    const applyAudio = async (work) => {
        try {
            await work();
        } catch (e) {
            console.error('audio update failed', e);
        }
        onAudioChanged?.();
    };

    const add = () => {
        const remain = Math.max(1, totalMeasures - assigned);
        onChange([
            ...sections,
            { id: crypto.randomUUID(), name: `セクション${sections.length + 1}`, measures: remain },
        ]);
    };

    // セクション削除: ドラム小節・録音も削除し、後続を前へ詰める。
    const remove = (r) => {
        if (!confirm(`「${r.name}」とその区間のドラム・録音を削除します。よろしいですか？`)) return;

        const newSections = sections.filter((s) => s.id !== r.id);
        let newPattern = pattern.filter((m) => m.measure < r.start || m.measure > r.end);
        if (newPattern.length === 0) newPattern = [{ measure: 1, beats: 4, unit: 4, notes: [] }];
        newPattern = newPattern.map((m, i) => ({ ...m, measure: i + 1 }));

        const startSec = measureStartSeconds(pattern, bpm, r.start, sections);
        const endSec = measureStartSeconds(pattern, bpm, r.end + 1, sections);
        const removed = endSec - startSec;
        const rIndex = ranges.findIndex((x) => x.id === r.id);
        const deleteIds = [];
        const shiftItems = [];
        (audioTracks ?? []).forEach((t) => {
            const off = (t.offset_ms || 0) / 1000;
            const near = nearestSection(off, pattern, bpm, sections);
            if (!near) return;
            if (near.index === rIndex) {
                deleteIds.push(t.id);
            } else if (near.index > rIndex) {
                shiftItems.push({ id: t.id, offset_ms: Math.max(0, Math.round((off - removed) * 1000)) });
            }
        });

        onPatternChange(newPattern); // ドラム・構成は自動保存に委譲
        onChange(newSections);
        applyAudio(async () => {
            if (deleteIds.length) {
                await api.post(route('audio-tracks.destroy-many', songId), { ids: deleteIds });
            }
            if (shiftItems.length) {
                await api.post(route('audio-tracks.offsets', songId), { items: shiftItems });
            }
        });
    };

    // セクションを上下に移動。ドラム小節ブロックと録音も完全に入れ替える。
    const move = (index, dir) => {
        const j = index + dir;
        if (j < 0 || j >= sections.length) return;

        const newSections = [...sections];
        [newSections[index], newSections[j]] = [newSections[j], newSections[index]];

        const oldRanges = sectionRanges(sections);
        // 各セクションの「宣言小節数ぶん」のブロック（足りなければ空小節で補完）。
        const blocks = {};
        const dur = {};
        oldRanges.forEach((r) => {
            const block = [];
            for (let k = 0; k < r.measures; k++) {
                const mm = pattern.find((m) => m.measure === r.start + k);
                block.push(mm ? { ...mm } : { beats: 4, unit: 4, notes: [] });
            }
            blocks[r.id] = block;
            const rb = r.bpm || bpm; // セクションのBPM
            dur[r.id] = block.reduce((s, m) => s + measureDurationSeconds(m.beats, m.unit, rb), 0);
        });

        const startSecMap = (ordered) => {
            const map = {};
            let t = 0;
            ordered.forEach((s) => {
                map[s.id] = t;
                t += dur[s.id] ?? 0;
            });
            return map;
        };
        const oldStart = startSecMap(sections);
        const newStart = startSecMap(newSections);

        let newPattern = [];
        newSections.forEach((s) => newPattern.push(...blocks[s.id].map((m) => ({ ...m }))));
        const covered = oldRanges.reduce((a, r) => a + r.measures, 0);
        newPattern.push(...pattern.filter((m) => m.measure > covered).map((m) => ({ ...m })));
        newPattern = newPattern.map((m, i) => ({ ...m, measure: i + 1 }));

        const items = [];
        (audioTracks ?? []).forEach((t) => {
            const off = (t.offset_ms || 0) / 1000;
            const near = nearestSection(off, pattern, bpm, sections);
            if (!near) return;
            const id = near.range.id;
            items.push({ id: t.id, offset_ms: Math.round((newStart[id] + (off - oldStart[id])) * 1000) });
        });

        onPatternChange(newPattern);
        onChange(newSections);
        if (items.length) {
            applyAudio(() => api.post(route('audio-tracks.offsets', songId), { items }));
        }
    };

    // セクションを末尾に複製: ドラムと録音をまとめてコピー。
    const duplicate = (range) => {
        const baseLen = pattern.length;
        const src = pattern.filter((m) => m.measure >= range.start && m.measure <= range.end);
        const appended = src.map((m, i) => ({
            ...m,
            measure: baseLen + i + 1,
            notes: m.notes.map((n) => ({ ...n, id: crypto.randomUUID() })),
        }));
        const newPattern = [...pattern, ...appended];
        const newSections = [
            ...sections,
            { id: crypto.randomUUID(), name: `${range.name} (コピー)`, measures: range.measures, bpm: range.bpm },
        ];

        const secStart = measureStartSeconds(pattern, bpm, range.start, sections);
        const secEnd = measureStartSeconds(pattern, bpm, range.end + 1, sections);
        const newSecStart = measureStartSeconds(newPattern, bpm, baseLen + 1, newSections);
        const items = (audioTracks ?? [])
            .filter((t) => nearestSection((t.offset_ms || 0) / 1000, pattern, bpm, sections)?.range.id === range.id)
            .map((t) => ({
                id: t.id,
                name: `${t.name} (コピー)`,
                offset_ms: Math.round((newSecStart + ((t.offset_ms || 0) / 1000 - secStart)) * 1000),
            }));

        onPatternChange(newPattern);
        onChange(newSections);
        if (items.length) {
            applyAudio(() => api.post(route('audio-tracks.duplicate-many', songId), { items }));
        }
    };

    return (
        <section className="rounded-lg bg-zinc-900 p-3">
            <h2 className="mb-2 text-sm font-bold tracking-wide text-zinc-300">曲構成（セクション）</h2>

            <div className="space-y-1.5">
                {sections.length === 0 && (
                    <p className="text-sm text-zinc-600">セクション未設定（「+ 追加」で作成）</p>
                )}
                {ranges.map((r, i) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="flex flex-col leading-none">
                            <button
                                onClick={() => move(i, -1)}
                                disabled={i === 0}
                                className="px-1 text-[10px] text-zinc-400 hover:text-green-400 disabled:opacity-20"
                                title="上へ"
                            >
                                ▲
                            </button>
                            <button
                                onClick={() => move(i, 1)}
                                disabled={i === ranges.length - 1}
                                className="px-1 text-[10px] text-zinc-400 hover:text-green-400 disabled:opacity-20"
                                title="下へ"
                            >
                                ▼
                            </button>
                        </span>
                        <button
                            onClick={() => onPlayOnly?.(r)}
                            className="rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white hover:bg-green-600"
                            title="このセクションのみ再生"
                        >
                            ▶のみ
                        </button>
                        <button
                            onClick={() => onPlayFrom?.(r)}
                            className="rounded bg-green-800 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
                            title="このセクションから最後まで再生"
                        >
                            ▶〜最後
                        </button>
                        <input
                            value={r.name}
                            onChange={(e) => update(r.id, 'name', e.target.value)}
                            className="w-28 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                        />
                        <label className="flex items-center gap-1 text-zinc-400">
                            小節
                            <input
                                type="number"
                                min="1"
                                value={r.measures}
                                onChange={(e) => update(r.id, 'measures', Math.max(1, Number(e.target.value) || 1))}
                                className="w-14 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                            />
                        </label>
                        <label className="flex items-center gap-1 text-zinc-400">
                            BPM
                            <input
                                type="number"
                                min="20"
                                max="300"
                                placeholder={String(bpm)}
                                value={r.bpm ?? ''}
                                onChange={(e) =>
                                    update(r.id, 'bpm', e.target.value === '' ? null : Number(e.target.value))
                                }
                                className="w-16 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                            />
                        </label>
                        <label className="flex items-center gap-1 text-zinc-400">
                            Swing
                            <select
                                value={r.swing ?? ''}
                                onChange={(e) => update(r.id, 'swing', e.target.value)}
                                className="rounded bg-zinc-800 px-1 py-1 text-zinc-100 outline-none"
                            >
                                <option value="">全体に従う</option>
                                <option value="0">なし</option>
                                <option value="8">8分</option>
                                <option value="16">16分</option>
                            </select>
                        </label>
                        <span className="text-xs text-zinc-500">
                            小節 {r.start}–{r.end}
                        </span>
                        <button
                            onClick={() => duplicate(r)}
                            className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700"
                            title="このセクションのドラムと録音を末尾に複製"
                        >
                            複製
                        </button>
                        <button
                            onClick={() => remove(r)}
                            className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-zinc-800"
                        >
                            削除
                        </button>
                    </div>
                ))}
            </div>

            <div className="mt-2 flex items-center gap-3">
                <button onClick={add} className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">
                    + 追加
                </button>
                <span className="text-xs text-zinc-500">
                    割当 {assigned} 小節 / ドラム {totalMeasures} 小節
                    {assigned !== totalMeasures && '（不一致）'}
                </span>
            </div>
        </section>
    );
}
