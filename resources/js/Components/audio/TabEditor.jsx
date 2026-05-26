import React, { useEffect, useState } from 'react';
import MiniTab, { TAB_LABELS } from './MiniTab';
import { measureSlots, sixteenthsPerBeat } from '../../constants/drumMap';
import { chordToShapes } from '../../lib/chordToTab';

// よく使うコード候補（datalist）。
const CHORD_SUGGESTIONS = [
    'C', 'D', 'E', 'F', 'G', 'A', 'B',
    'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm',
    'C7', 'D7', 'E7', 'G7', 'A7', 'B7',
    'Cmaj7', 'Dm7', 'Em7', 'Gmaj7', 'Am7',
    'F#m', 'C#m', 'G#m', 'Bb', 'Eb', 'Ab',
];

function parse(notation) {
    try {
        const o = JSON.parse(notation);
        if (o && o.cells) {
            return { instrument: o.instrument === 'bass' ? 'bass' : 'guitar', cells: o.cells || {} };
        }
    } catch (_) {
        /* 空・旧形式 */
    }
    return { instrument: 'guitar', cells: {} };
}

// 小節ベースのタブ譜エディタ。
// 各小節のミニタブをクリックすると、その小節の弦×16分グリッドのポップアップが開く。
// 上段に小節ごとのコードを入力できる（曲共通）。
export default function TabEditor({ notation, onSave, measures = [], chords = {}, onChordsChange, instrument: instrumentProp }) {
    const [state, setState] = useState(() => parse(notation));
    const [popup, setPopup] = useState(null); // { measure } or null
    const [clip, setClip] = useState(null); // コピーした小節の { slot_row: fret }

    useEffect(() => setState(parse(notation)), [notation]);

    // タブ譜の楽器はチャンネル名（親）に追従させる。未指定時のみ保存済みの値を使う。
    const instrument = instrumentProp || state.instrument;
    const labels = TAB_LABELS[instrument] || TAB_LABELS.guitar;

    const apply = (next) => {
        setState(next);
        onSave(JSON.stringify({ instrument, cells: next.cells }));
    };

    const setChord = (m, val) => {
        const next = { ...chords };
        if (val.trim() === '') delete next[m];
        else next[m] = val;
        onChordsChange?.(next);
    };

    // コード入力確定時、その小節が空ならコードのパワーコード/ルートをタブに反映する。
    // 既に入力済みの小節は上書きしない。複数コード（空白区切り）は小節を等分して配置。
    const fillFromChord = (m, val) => {
        const measure = measures.find((x) => x.measure === m);
        if (!measure) return;
        // 既存の打ち込みがあれば何もしない
        const hasData = Object.keys(state.cells).some((k) => Number(k.split('_')[0]) === m);
        if (hasData) return;

        const names = (val || '').trim().split(/\s+/).filter(Boolean);
        if (names.length === 0) return;

        const total = measureSlots(measure.beats, measure.unit);
        const strings = labels.length;
        const cells = { ...state.cells };
        names.forEach((nm, i) => {
            const shapes = chordToShapes(nm, instrument);
            if (!shapes || shapes.length === 0) return;
            const slot = Math.min(total - 1, Math.round((i * total) / names.length));
            shapes.forEach((sh) => {
                const row = strings - 1 - sh.string; // 低音弦(0) → 最下段
                cells[`${m}_${slot}_${row}`] = String(sh.fret);
            });
        });
        apply({ ...state, cells });
    };

    const setCell = (measure, slot, row, val) => {
        const v = val.replace(/[^0-9]/g, '').slice(0, 2);
        setState((s) => {
            const cells = { ...s.cells };
            const key = `${measure}_${slot}_${row}`;
            if (v === '') delete cells[key];
            else cells[key] = v;
            return { ...s, cells };
        });
    };
    const saveCells = () => onSave(JSON.stringify({ instrument, cells: state.cells }));

    // 小節のタブをコピー（"slot_row": fret の相対形で保持）。
    const copyMeasure = (measure) => {
        const c = {};
        Object.entries(state.cells).forEach(([k, fret]) => {
            const [M, S, R] = k.split('_').map(Number);
            if (M === measure) c[`${S}_${R}`] = fret;
        });
        setClip(c);
    };
    // コピー内容を対象小節へ貼り付け（その小節の既存は置換）。
    const pasteMeasure = (measure) => {
        if (!clip) return;
        const next = { ...state.cells };
        Object.keys(next).forEach((k) => {
            if (Number(k.split('_')[0]) === measure) delete next[k];
        });
        Object.entries(clip).forEach(([sr, fret]) => {
            next[`${measure}_${sr}`] = fret;
        });
        apply({ ...state, cells: next });
    };

    const popMeasure = popup ? measures.find((m) => m.measure === popup.measure) : null;

    return (
        <div className="mt-1 rounded bg-zinc-950 p-2">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-semibold text-zinc-200">
                    {instrument === 'bass' ? 'Bass (4弦)' : 'Guitar (6弦)'}
                </span>
                <span className="text-zinc-500">チャンネル名に追従・小節をクリックして入力</span>
            </div>

            {measures.length === 0 && (
                <p className="text-[11px] text-zinc-600">このトラックの担当小節がありません（セクション設定が必要）</p>
            )}

            {/* 小節ごとにコード + ミニタブ */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {measures.map((m) => (
                    <div key={m.measure} className="rounded border border-zinc-800 p-1">
                        <input
                            list="chord-suggestions"
                            value={chords[m.measure] ?? ''}
                            onChange={(e) => setChord(m.measure, e.target.value)}
                            onBlur={(e) => fillFromChord(m.measure, e.target.value)}
                            placeholder="コード"
                            className="mb-1 w-full rounded bg-zinc-800 px-1 py-0.5 text-center text-[11px] font-bold text-amber-300 outline-none"
                        />
                        <button
                            type="button"
                            onClick={() => setPopup({ measure: m.measure })}
                            className="block w-full rounded bg-zinc-900 hover:bg-zinc-800"
                            title={`小節${m.measure}を入力`}
                        >
                            <MiniTab
                                cells={state.cells}
                                measure={m.measure}
                                beats={m.beats}
                                unit={m.unit}
                                instrument={instrument}
                            />
                        </button>
                        <div className="flex items-center justify-between text-[9px] text-zinc-600">
                            <span>小節 {m.measure}</span>
                            <span className="flex gap-0.5">
                                <button
                                    onClick={() => copyMeasure(m.measure)}
                                    className="rounded px-1 hover:bg-zinc-800"
                                    title="この小節をコピー"
                                >
                                    コピー
                                </button>
                                <button
                                    onClick={() => pasteMeasure(m.measure)}
                                    disabled={!clip}
                                    className="rounded px-1 hover:bg-zinc-800 disabled:opacity-30"
                                    title="貼付け"
                                >
                                    貼付
                                </button>
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <datalist id="chord-suggestions">
                {CHORD_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                ))}
            </datalist>

            {/* 入力ポップアップ（弦×16分グリッド） */}
            {popMeasure && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setPopup(null)} />
                    <div className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-300">
                                小節 {popMeasure.measure} のタブ入力（{popMeasure.beats}/{popMeasure.unit}）
                            </span>
                            <button
                                onClick={() => setPopup(null)}
                                className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-zinc-800"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="border-collapse">
                                <tbody>
                                    {labels.map((lbl, row) => {
                                        const total = measureSlots(popMeasure.beats, popMeasure.unit);
                                        const spb = sixteenthsPerBeat(popMeasure.unit);
                                        return (
                                            <tr key={row}>
                                                <td className="pr-1 text-right font-mono text-[11px] text-zinc-500">
                                                    {lbl}
                                                </td>
                                                {Array.from({ length: total }, (_, slot) => (
                                                    <td key={slot} className={slot % spb === 0 ? 'pl-1' : ''}>
                                                        <input
                                                            value={state.cells[`${popMeasure.measure}_${slot}_${row}`] ?? ''}
                                                            onChange={(e) => setCell(popMeasure.measure, slot, row, e.target.value)}
                                                            onBlur={saveCells}
                                                            placeholder="-"
                                                            className="h-5 w-6 border-b border-zinc-700 bg-transparent text-center font-mono text-xs text-green-300 outline-none placeholder:text-zinc-700 focus:bg-zinc-800"
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
