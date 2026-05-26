import React, { useEffect, useRef, useState } from 'react';
import NotePalette from './NotePalette';
import DrumStaff from './DrumStaff';
import DrumGrid from './DrumGrid';
import { DENOMINATORS, sixteenthsPerBeat } from '../../constants/drumMap';
import { GENRES, BEAT_TYPES, MEASURE_COUNTS, buildPresetPattern } from '../../constants/drumPresets';
import { sectionRanges, sectionOfMeasure } from '../../lib/sections';

// notes を複製して新しい id を振る（コピペ用）。
function cloneNotes(notes) {
    return notes.map((n) => ({ ...n, id: crypto.randomUUID() }));
}

export default function DrumEditor({ beatsPerMeasure, pattern, sections = [], playingMeasure = null, followEnabled = true, viewSectionId = '', onViewSectionChange, onChange, onPreview, onPlayMeasure }) {
    const [tool, setTool] = useState('8');
    const [selected, setSelected] = useState(1);
    const [checked, setChecked] = useState(() => new Set());
    const [clipboard, setClipboard] = useState(null); // { beats, unit, notes }[]
    const [genre, setGenre] = useState('rock');
    const [beatType, setBeatType] = useState('8');
    const [presetMeasures, setPresetMeasures] = useState(16);
    const setViewSectionId = (id) => onViewSectionChange?.(id); // 表示セクションは親と共有
    const [padPos, setPadPos] = useState(null); // 打ち込みポップアップの位置（null=非表示）
    const [collapsedSections, setCollapsedSections] = useState(() => new Set()); // 全体表示で折りたたみ中のセクション
    const cardRefs = useRef({}); // 小節カードの DOM 参照（再生ヘッド追従用）

    const toggleSection = (id) =>
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    // 小節クリック: その小節を選択し、譜面（カード）を隠さない位置にポップアップを開く。
    const openPad = (measure, e) => {
        setSelected(measure);
        const rect = e.currentTarget.getBoundingClientRect();
        const W = 420;
        const H = 340;
        let left = rect.left;
        if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
        if (left < 8) left = 8;
        let top = rect.bottom + 6; // カードの下に表示 → 譜面を隠さない
        if (top + H > window.innerHeight - 8) top = Math.max(8, window.innerHeight - H - 8);
        setPadPos({ top, left, width: W });
    };
    const closePad = () => setPadPos(null);

    // ポップアップをドラッグで移動（譜面が隠れたとき用）。
    const onDragStart = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const orig = padPos;
        const onMove = (ev) => {
            setPadPos({
                ...orig,
                left: Math.max(0, orig.left + (ev.clientX - startX)),
                top: Math.max(0, orig.top + (ev.clientY - startY)),
            });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const ranges = sectionRanges(sections);
    const viewRange = ranges.find((r) => r.id === viewSectionId) ?? null;
    const visible = viewRange
        ? pattern.filter((m) => m.measure >= viewRange.start && m.measure <= viewRange.end)
        : pattern;

    const selMeasure = pattern.find((m) => m.measure === selected) ?? pattern[0];

    // 再生ヘッド追従: 鳴っている小節が表示外なら全体表示にし、その小節へスクロール。
    useEffect(() => {
        if (playingMeasure == null || !followEnabled) return;
        if (viewRange && (playingMeasure < viewRange.start || playingMeasure > viewRange.end)) {
            setViewSectionId('');
        }
        const el = cardRefs.current[playingMeasure];
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [playingMeasure, followEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

    const editMeasure = (measure, updater) => {
        onChange(
            pattern.map((m) => (m.measure === measure ? { ...m, notes: updater(m.notes) } : m))
        );
    };

    const handleCell = (measure, drumKey, beat, subdivision) => {
        const target = pattern.find((m) => m.measure === measure);
        const existing = target?.notes.find(
            (n) => n.drumKey === drumKey && n.beat === beat && n.subdivision === subdivision
        );
        if (existing || tool === 'erase') {
            if (!existing) return;
            editMeasure(measure, (notes) => notes.filter((n) => n.id !== existing.id));
        } else {
            editMeasure(measure, (notes) => [
                ...notes,
                { id: crypto.randomUUID(), drumKey, beat, subdivision, duration: tool },
            ]);
            onPreview?.(drumKey);
        }
    };

    const setMeter = (measure, beats, unit) => {
        const spb = sixteenthsPerBeat(unit);
        onChange(
            pattern.map((m) =>
                m.measure === measure
                    ? {
                          ...m,
                          beats,
                          unit,
                          notes: m.notes.filter(
                              (n) => n.beat >= 1 && n.beat <= beats && n.subdivision >= 0 && n.subdivision < spb
                          ),
                      }
                    : m
            )
        );
    };

    const addMeasure = () => {
        const last = pattern[pattern.length - 1];
        const next = [
            ...pattern,
            { measure: pattern.length + 1, beats: last?.beats ?? beatsPerMeasure ?? 4, unit: last?.unit ?? 4, notes: [] },
        ];
        onChange(next);
        setSelected(next.length);
    };

    const removeMeasure = (measure) => {
        if (pattern.length <= 1) return;
        const next = pattern.filter((m) => m.measure !== measure).map((m, i) => ({ ...m, measure: i + 1 }));
        onChange(next);
        setSelected((s) => Math.min(s, next.length));
        setChecked(new Set());
    };

    const toggleCheck = (measure) => {
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(measure) ? next.delete(measure) : next.add(measure);
            return next;
        });
    };

    const measureToClip = (m) => ({ beats: m.beats, unit: m.unit, notes: m.notes.map((n) => ({ ...n })) });
    const copyMeasure = (measure) => {
        const m = pattern.find((x) => x.measure === measure);
        if (m) setClipboard([measureToClip(m)]);
    };
    const copyChecked = () => {
        const clip = [...checked]
            .sort((a, b) => a - b)
            .map((num) => pattern.find((m) => m.measure === num))
            .filter(Boolean)
            .map(measureToClip);
        if (clip.length) setClipboard(clip);
    };
    const pasteAt = (startMeasure) => {
        if (!clipboard?.length) return;
        let next = pattern.map((m) => ({ ...m, notes: [...m.notes] }));
        clipboard.forEach((clip, i) => {
            const target = startMeasure + i;
            const entry = { measure: target, beats: clip.beats, unit: clip.unit, notes: cloneNotes(clip.notes) };
            const idx = next.findIndex((m) => m.measure === target);
            if (idx >= 0) next[idx] = entry;
            else next.push(entry);
        });
        next.sort((a, b) => a.measure - b.measure);
        next = next.map((m, i) => ({ ...m, measure: i + 1 }));
        onChange(next);
    };

    // プリセット配置: 8/16ビート×小節数のパターンをカーソル位置から上書き配置する。
    // 既存小節と重なる部分は上書きし、足りない分は末尾に追加する。
    const insertPreset = () => {
        const bars = buildPresetPattern(genre, beatType, presetMeasures);
        const newMeasures = bars.map((notes) => ({ beats: 4, unit: 4, notes: cloneNotes(notes) }));
        let next;
        if (pattern.length === 1 && pattern[0].notes.length === 0) {
            // 空の初期状態なら置き換え。
            next = newMeasures;
        } else {
            const start = Math.max(0, selected - 1); // カーソル小節(0始まり)から
            next = pattern.map((m) => ({ ...m }));
            newMeasures.forEach((nm, i) => {
                const idx = start + i;
                if (idx < next.length) next[idx] = nm; // 重なりは上書き
                else next.push(nm); // 足りなければ追加
            });
        }
        next = next.map((m, i) => ({ ...m, measure: i + 1 }));
        onChange(next);
        setSelected(Math.max(1, selected));
    };

    const iconBtn = 'rounded px-1.5 py-0.5 text-[11px] hover:bg-zinc-700 disabled:opacity-30';
    const clipCount = clipboard?.length ?? 0;

    // 1 小節カードの描画（フラット一覧・セクション別グループの両方で使う）。
    const renderCard = (m) => {
        const gIdx = pattern.findIndex((p) => p.measure === m.measure);
        const prev = pattern[gIdx - 1];
        const showHeader = gIdx === 0 || prev.beats !== m.beats || prev.unit !== m.unit;
        const isSel = m.measure === selected;
        const isPlaying = m.measure === playingMeasure;
        const isChecked = checked.has(m.measure);
        const sec = sectionOfMeasure(sections, m.measure);
        const isSectionStart = sec && sec.start === m.measure;
        return (
            <div
                key={m.measure}
                ref={(el) => (cardRefs.current[m.measure] = el)}
                className={[
                    'rounded-lg border bg-zinc-950/40 p-1.5',
                    isPlaying
                        ? 'border-amber-400 ring-2 ring-amber-400'
                        : isSel
                          ? 'border-green-500 ring-1 ring-green-500'
                          : 'border-zinc-800',
                ].join(' ')}
            >
                {sec && (
                    <div className={['mb-1 truncate rounded px-1.5 py-0.5 text-[10px] font-bold', isSectionStart ? 'bg-green-600/30 text-green-300' : 'bg-zinc-800 text-zinc-500'].join(' ')}>
                        {isSectionStart ? `▶ ${sec.name}` : sec.name}
                    </div>
                )}
                <div className="mb-1 flex items-center justify-between">
                    <label className="flex items-center gap-1 text-[11px] font-bold text-zinc-400">
                        <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(m.measure)} className="accent-green-500" />
                        小節 {m.measure}
                        <span className="text-zinc-500">({m.beats}/{m.unit})</span>
                    </label>
                    <div className="flex items-center gap-0.5 text-zinc-300">
                        <button onClick={() => onPlayMeasure?.(m.measure)} className={`${iconBtn} text-green-400`} title="この小節を再生">▶</button>
                        <button onClick={() => copyMeasure(m.measure)} className={iconBtn} title="この小節をコピー">コピー</button>
                        <button onClick={() => pasteAt(m.measure)} disabled={!clipboard} className={iconBtn} title="この小節を起点に貼付け">貼付</button>
                        <button onClick={() => removeMeasure(m.measure)} disabled={pattern.length <= 1} className={`${iconBtn} text-red-400`} title="削除">✕</button>
                    </div>
                </div>
                <button type="button" onClick={(e) => openPad(m.measure, e)} className="block w-full cursor-pointer">
                    <DrumStaff notes={m.notes} beats={m.beats} unit={m.unit} showHeader={showHeader} />
                </button>
            </div>
        );
    };

    return (
        <section className="rounded-lg bg-zinc-900 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold tracking-wide text-zinc-300">DRUM TRACK</h2>
            </div>

            {/* プリセット: ジャンル × ビート × 小節数。カーソル位置から上書き配置。 */}
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 text-xs">
                <span className="font-bold text-zinc-300">プリセット</span>
                <label className="flex flex-col text-zinc-400">
                    ジャンル
                    <select value={genre} onChange={(e) => setGenre(e.target.value)} className="mt-0.5 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none">
                        {GENRES.map((g) => (
                            <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col text-zinc-400">
                    ビート
                    <select value={beatType} onChange={(e) => setBeatType(e.target.value)} className="mt-0.5 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none">
                        {BEAT_TYPES.map((b) => (
                            <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col text-zinc-400">
                    小節数
                    <select value={presetMeasures} onChange={(e) => setPresetMeasures(Number(e.target.value))} className="mt-0.5 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none">
                        {MEASURE_COUNTS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <button onClick={insertPreset} className="rounded bg-green-600 px-3 py-1.5 font-semibold text-white hover:bg-green-500">
                    小節 {selected} から上書き配置
                </button>
            </div>

            {/* コピペ用ツールバー */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <button onClick={copyChecked} disabled={checked.size === 0} className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 disabled:opacity-40">
                    選択した {checked.size} 小節をコピー
                </button>
                <button onClick={() => pasteAt(selected)} disabled={!clipboard} className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 disabled:opacity-40">
                    小節 {selected} から貼付け
                </button>
                {checked.size > 0 && (
                    <button onClick={() => setChecked(new Set())} className="underline">選択解除</button>
                )}
                <span className="ml-auto">{clipCount > 0 ? `クリップボード: ${clipCount} 小節` : 'クリップボード: 空'}</span>
            </div>

            {/* セクション表示切替: 選ぶと譜面がそのセクションだけになる。 */}
            {ranges.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
                    <span className="text-zinc-500">表示:</span>
                    <button
                        onClick={() => setViewSectionId('')}
                        className={`rounded px-2 py-1 ${viewSectionId === '' ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    >
                        全体
                    </button>
                    {ranges.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => {
                                setViewSectionId(r.id);
                                setSelected(r.start);
                            }}
                            className={`rounded px-2 py-1 ${viewSectionId === r.id ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                        >
                            {r.name}({r.measures})
                        </button>
                    ))}
                </div>
            )}

            {/* 譜面一覧: 4 小節/行。全体表示かつセクションありのときはセクションごとに折りたためる。 */}
            {viewRange || ranges.length === 0 ? (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {visible.map(renderCard)}
                </div>
            ) : (
                <div className="space-y-2">
                    {ranges.map((r) => {
                        const secMeasures = pattern.filter((m) => m.measure >= r.start && m.measure <= r.end);
                        if (secMeasures.length === 0) return null;
                        const isCollapsed = collapsedSections.has(r.id);
                        const noteCount = secMeasures.reduce((acc, m) => acc + (m.notes?.length ?? 0), 0);
                        return (
                            <div key={r.id} className="rounded-lg border border-zinc-800">
                                <button
                                    onClick={() => toggleSection(r.id)}
                                    className="flex w-full items-center gap-2 rounded-t-lg bg-zinc-800/60 px-3 py-1.5 text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                                >
                                    <span>{isCollapsed ? '▶' : '▼'}</span>
                                    {r.name}
                                    <span className="font-normal text-zinc-500">
                                        小節{r.start}〜{r.end}・{secMeasures.length}小節・{noteCount}音
                                    </span>
                                </button>
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 gap-2 p-2 lg:grid-cols-4">
                                        {secMeasures.map(renderCard)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* どのセクションにも属さない末尾の小節 */}
                    {(() => {
                        const lastEnd = ranges.length ? ranges[ranges.length - 1].end : 0;
                        const rest = pattern.filter((m) => m.measure > lastEnd);
                        if (rest.length === 0) return null;
                        return (
                            <div className="rounded-lg border border-dashed border-zinc-800">
                                <div className="px-3 py-1.5 text-xs font-bold text-zinc-500">セクション外</div>
                                <div className="grid grid-cols-2 gap-2 p-2 lg:grid-cols-4">{rest.map(renderCard)}</div>
                            </div>
                        );
                    })()}
                </div>
            )}

            <button onClick={addMeasure} className="mt-2 rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700">
                + 小節追加
            </button>

            {/* 選択中の小節の打ち込みポップアップ（譜面を隠さない位置に表示） */}
            {selMeasure && padPos && (
                <>
                    <div className="fixed inset-0 z-40" onClick={closePad} />
                    <div
                        className="fixed z-50 max-h-[75vh] max-w-[95vw] w-max overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl"
                        style={{ top: padPos.top, left: padPos.left }}
                    >
                        <div
                            onMouseDown={onDragStart}
                            className="mb-2 -mt-1 cursor-move select-none rounded bg-zinc-800 py-0.5 text-center text-[10px] text-zinc-500 hover:bg-zinc-700"
                            title="ドラッグで移動"
                        >
                            ⋮⋮ ドラッグで移動 ⋮⋮
                        </div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-zinc-300">小節 {selected} の打ち込み</span>
                                <span className="flex items-center gap-1 text-xs text-zinc-400">
                                    拍子
                                    <input
                                        type="number"
                                        min="1"
                                        max="16"
                                        value={selMeasure.beats}
                                        onChange={(e) => setMeter(selected, Math.max(1, Number(e.target.value) || 1), selMeasure.unit)}
                                        className="w-14 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                                    />
                                    /
                                    <select value={selMeasure.unit} onChange={(e) => setMeter(selected, selMeasure.beats, Number(e.target.value))} className="rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none">
                                        {DENOMINATORS.map((d) => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => copyMeasure(selected)} className={iconBtn}>コピー</button>
                                <button onClick={() => pasteAt(selected)} disabled={!clipboard} className={iconBtn}>貼付</button>
                                <button onClick={closePad} className={`${iconBtn} text-red-400`} title="閉じる">✕</button>
                            </div>
                        </div>

                        <div className="mb-3">
                            <NotePalette tool={tool} onSelect={setTool} />
                        </div>

                        <DrumGrid
                            measure={selected}
                            notes={selMeasure.notes}
                            beats={selMeasure.beats}
                            unit={selMeasure.unit}
                            tool={tool}
                            onCell={handleCell}
                        />
                    </div>
                </>
            )}
        </section>
    );
}
