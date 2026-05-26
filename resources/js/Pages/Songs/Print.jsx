import React from 'react';
import { Head, Link } from '@inertiajs/react';
import DrumStaff from '../../Components/drum/DrumStaff';
import MiniTab from '../../Components/audio/MiniTab';

function initialPattern(drumTrack, song) {
    const base = drumTrack?.pattern?.length ? drumTrack.pattern : [{ measure: 1, notes: [] }];
    return base.map((m) => ({
        measure: m.measure,
        beats: m.beats ?? song.beats_per_measure ?? 4,
        unit: m.unit ?? 4,
        notes: m.notes ?? [],
    }));
}

// instrument(guitar/bass) 別に全トラックの notation.cells をマージする。
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

// 印刷用バンド譜面: 小節ごとに コード / ギター / ベース / ドラム を縦に揃えて並べる。
export default function Print({ song, audioTracks, drumTrack }) {
    const pattern = initialPattern(drumTrack, song);
    const chords = song.chords ?? {};
    const lyrics = song.lyrics ?? {};
    const guitarCells = mergeCells(audioTracks, 'guitar');
    const bassCells = mergeCells(audioTracks, 'bass');
    const PER_ROW = 4;

    // 小節を PER_ROW ごとの行に分割。
    const rows = [];
    for (let i = 0; i < pattern.length; i += PER_ROW) rows.push(pattern.slice(i, i + PER_ROW));

    return (
        <div className="min-h-screen bg-white p-6 text-black">
            <Head title={`${song.title} - 譜面`} />

            <div className="mb-4 flex items-center justify-between print:hidden">
                <Link href={route('songs.edit', song.id)} className="text-sm text-blue-600 hover:underline">
                    ← エディタに戻る
                </Link>
                <button
                    onClick={() => window.print()}
                    className="rounded bg-zinc-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                    印刷
                </button>
            </div>

            <h1 className="text-2xl font-bold">{song.title}</h1>
            <div className="mb-4 text-sm text-zinc-600">
                BPM {song.bpm} / {song.beats_per_measure}拍子
            </div>

            <div className="space-y-4">
                {rows.map((row, ri) => (
                    <div key={ri} className="grid break-inside-avoid grid-cols-4 gap-2">
                        {row.map((m) => (
                            <div key={m.measure} className="border-l border-black pl-1">
                                <div className="text-[10px] text-zinc-500">小節 {m.measure}</div>
                                {/* コード */}
                                <div className="h-4 text-sm font-bold text-black">{chords[m.measure] ?? ''}</div>
                                {/* 歌詞（ギターの上） */}
                                <div className="min-h-4 text-[11px] leading-tight text-black">{lyrics[m.measure] ?? ''}</div>
                                {/* ギター */}
                                <div className="text-[9px] text-zinc-500">Gt</div>
                                <MiniTab cells={guitarCells} measure={m.measure} beats={m.beats} unit={m.unit} instrument="guitar" light />
                                {/* ベース */}
                                <div className="text-[9px] text-zinc-500">Ba</div>
                                <MiniTab cells={bassCells} measure={m.measure} beats={m.beats} unit={m.unit} instrument="bass" light />
                                {/* ドラム */}
                                <div className="text-[9px] text-zinc-500">Dr</div>
                                <DrumStaff notes={m.notes} beats={m.beats} unit={m.unit} showHeader={false} />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
