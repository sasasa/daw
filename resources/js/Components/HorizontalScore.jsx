import React, { useEffect, useRef } from 'react';
import MiniTab from './audio/MiniTab';
import DrumStaff from './drum/DrumStaff';
import { measureStartSeconds, measureDurationSeconds, measureBpm } from '../lib/sections';

// instrument(guitar/bass) 別に全トラックの notation.cells をマージする（Print と同じ）。
function mergeCells(audioTracks, instrument) {
    const cells = {};
    (audioTracks ?? []).forEach((t) => {
        try {
            const o = JSON.parse(t.notation);
            if (o && o.cells && (o.instrument === instrument || (!o.instrument && instrument === 'guitar'))) {
                Object.assign(cells, o.cells);
            }
        } catch (_) {
            /* skip */
        }
    });
    return cells;
}

// 横再生ビュー: 印刷譜面のような小節列（コード/歌詞/ギター/ベース/ドラム）を横一列に並べ、
// 再生位置に合わせて横スクロールしていく全画面オーバーレイ。
export default function HorizontalScore({
    open,
    onClose,
    title,
    pattern = [],
    sections = [],
    chords = {},
    lyrics = {},
    audioTracks = [],
    bpm = 120,
    currentMeasure = null,
    currentSeconds = 0,
    isPlaying = false,
    isPaused = false,
    onPlay,
    onStop,
    onPause,
    onResume,
    onSeekMeasure,
}) {
    const colRefs = useRef({});

    // 再生中の小節を画面中央へスクロール。
    useEffect(() => {
        if (!open || currentMeasure == null) return;
        const el = colRefs.current[currentMeasure];
        el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }, [currentMeasure, open]);

    if (!open) return null;

    const guitarCells = mergeCells(audioTracks, 'guitar');
    const bassCells = mergeCells(audioTracks, 'bass');

    // 再生中の小節内での進行度（再生ヘッド位置）。
    let headFrac = null;
    if (currentMeasure != null) {
        const mm = pattern.find((p) => p.measure === currentMeasure);
        if (mm) {
            const start = measureStartSeconds(pattern, bpm, currentMeasure, sections);
            const dur = measureDurationSeconds(mm.beats, mm.unit, measureBpm(sections, bpm, currentMeasure));
            headFrac = Math.min(1, Math.max(0, (currentSeconds - start) / (dur || 1)));
        }
    }

    return (
        <div className="fixed inset-0 z-[95] flex flex-col bg-zinc-950/98 text-zinc-100 backdrop-blur">
            {/* 上部コントロール */}
            <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
                <span className="text-sm font-bold tracking-wide text-zinc-200">▶ 横再生</span>
                <span className="truncate text-sm text-zinc-400">{title}</span>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => onPlay?.()}
                        disabled={isPlaying}
                        className="rounded bg-green-600 px-3 py-1.5 text-sm font-semibold hover:bg-green-500 disabled:opacity-40"
                    >
                        ▶ 最初から
                    </button>
                    {isPaused ? (
                        <button
                            onClick={() => onResume?.()}
                            className="rounded bg-green-600 px-3 py-1.5 text-sm font-semibold hover:bg-green-500"
                        >
                            ▶ 再開
                        </button>
                    ) : (
                        <button
                            onClick={() => onPause?.()}
                            disabled={!isPlaying}
                            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold hover:bg-amber-500 disabled:opacity-40"
                        >
                            ⏸ 一時停止
                        </button>
                    )}
                    <button
                        onClick={() => onStop?.()}
                        disabled={!isPlaying && !isPaused}
                        className="rounded bg-zinc-700 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-40"
                    >
                        ■ 停止
                    </button>
                    <button
                        onClick={onClose}
                        className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                        title="閉じる"
                    >
                        ✕ 閉じる
                    </button>
                </div>
            </div>

            {/* 横スクロールする譜面 */}
            <div className="flex-1 overflow-x-auto overflow-y-auto px-4 py-6">
                <div className="flex items-stretch gap-2">
                    {pattern.map((m) => {
                        const isCur = m.measure === currentMeasure;
                        return (
                            <div
                                key={m.measure}
                                ref={(el) => (colRefs.current[m.measure] = el)}
                                onClick={() => onSeekMeasure?.(m.measure)}
                                title="クリックでこの小節から再生 / 一時停止中は再生位置を移動"
                                className={[
                                    'relative shrink-0 cursor-pointer rounded-lg border p-2 hover:border-indigo-400',
                                    isCur ? 'border-amber-400 ring-2 ring-amber-400 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/40',
                                ].join(' ')}
                                style={{ width: 200 }}
                            >
                                {/* 再生ヘッド（現在小節内の進行位置） */}
                                {isCur && headFrac != null && (
                                    <div
                                        className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-amber-400"
                                        style={{ left: `${headFrac * 100}%` }}
                                    />
                                )}
                                <div className="mb-1 text-[10px] text-zinc-500">
                                    小節 {m.measure} <span className="text-zinc-600">({m.beats}/{m.unit})</span>
                                </div>
                                {/* コード */}
                                <div className="mb-1 h-5 text-sm font-bold text-amber-300">{chords[m.measure] ?? ''}</div>
                                {/* 歌詞 */}
                                <div className="mb-2 min-h-5 text-xs leading-tight text-zinc-100">{lyrics[m.measure] ?? ''}</div>
                                {/* ギター */}
                                <div className="text-[9px] text-zinc-500">Gt</div>
                                <MiniTab cells={guitarCells} measure={m.measure} beats={m.beats} unit={m.unit} instrument="guitar" />
                                {/* ベース */}
                                <div className="mt-1 text-[9px] text-zinc-500">Ba</div>
                                <MiniTab cells={bassCells} measure={m.measure} beats={m.beats} unit={m.unit} instrument="bass" />
                                {/* ドラム */}
                                <div className="mt-1 text-[9px] text-zinc-500">Dr</div>
                                <DrumStaff notes={m.notes} beats={m.beats} unit={m.unit} showHeader={false} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
