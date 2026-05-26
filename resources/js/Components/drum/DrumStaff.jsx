import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Beam } from 'vexflow';
import { DRUM_BY_KEY, sixteenthsPerBeat, measureSlots } from '../../constants/drumMap';

// パレット音価 → 16分音符を 1 単位とした長さ
const DUR_UNITS = { 4: 4, '4': 4, 8: 2, '8': 2, 16: 1, '16': 1 };
// 単位長 → VexFlow の音符コード（音符は 4/8/16 のみ）
const UNITS_TO_NOTE = { 4: 'q', 2: '8', 1: '16' };
// 残り時間を埋める休符（大きい単位から貪欲に）
const REST_PIECES = [
    { u: 16, d: 'wr' },
    { u: 8, d: 'hr' },
    { u: 4, d: 'qr' },
    { u: 2, d: '8r' },
    { u: 1, d: '16r' },
];

const STEM_UP = 1;
const STEM_DOWN = -1;

// drumKey → VexFlow key 文字列（符頭 x はクロス glyph 'x2'）。
function drumToKey(drumKey) {
    const d = DRUM_BY_KEY[drumKey];
    if (!d) return 'b/4';
    return d.notehead === 'x' ? `${d.pitch}/x2` : d.pitch;
}

// 1 声部分の notes を音符＋休符の列（Voice）に変換する。
// stemDir で符尾の向きを固定（手=上向き / 足=下向き）。休符は restKey の高さに置く。
function buildVoice(notes, beats, unit, stemDir, restKey) {
    const spb = sixteenthsPerBeat(unit);
    const totalSlots = measureSlots(beats, unit);

    const onsetMap = new Map();
    notes.forEach((n) => {
        const slot = (n.beat - 1) * spb + n.subdivision;
        if (!onsetMap.has(slot)) onsetMap.set(slot, []);
        onsetMap.get(slot).push(n);
    });
    const onsets = [...onsetMap.keys()].sort((a, b) => a - b);

    const staveNotes = [];
    const pushRests = (units) => {
        let remain = units;
        for (const piece of REST_PIECES) {
            while (remain >= piece.u) {
                staveNotes.push(new StaveNote({ keys: [restKey], duration: piece.d }));
                remain -= piece.u;
            }
        }
    };

    let cursor = 0;
    onsets.forEach((slot, i) => {
        if (slot > cursor) {
            pushRests(slot - cursor);
            cursor = slot;
        }
        const hits = onsetMap.get(slot);
        const nextSlot = onsets[i + 1] ?? totalSlots;
        const gap = nextSlot - slot;

        let u = Math.min(...hits.map((h) => DUR_UNITS[h.duration] ?? 1));
        u = Math.min(u, gap);
        const noteUnits = u >= 4 ? 4 : u >= 2 ? 2 : 1;

        const keys = hits
            .slice()
            .sort((a, b) => (DRUM_BY_KEY[b.drumKey]?.row ?? 0) - (DRUM_BY_KEY[a.drumKey]?.row ?? 0))
            .map((h) => drumToKey(h.drumKey));

        staveNotes.push(
            new StaveNote({ keys, duration: UNITS_TO_NOTE[noteUnits], stem_direction: stemDir })
        );
        cursor += noteUnits;
    });
    if (cursor < totalSlots) pushRests(totalSlots - cursor);

    const voice = new Voice({ num_beats: beats, beat_value: unit }).setStrict(false);
    voice.addTickables(staveNotes);

    let beams = [];
    try {
        beams = Beam.generateBeams(staveNotes.filter((n) => !n.isRest()), {
            stem_direction: stemDir,
        });
    } catch (_) {
        beams = [];
    }
    return { voice, beams };
}

// 1 小節分の notes をドラム譜（percussion 五線）に描画する。
// 手（バスドラム以外）= 符尾上向き、足（バスドラム）= 符尾下向きの 2 声部。
// コンテナ幅にフィット。showHeader の小節だけクレフ＋拍子（beats/unit）を描く。
export default function DrumStaff({ notes, beats, unit = 4, showHeader = false, height = 110 }) {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setWidth(el.clientWidth);
        const ro = new ResizeObserver((entries) => {
            setWidth(Math.floor(entries[0].contentRect.width));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || width <= 0) return;
        el.innerHTML = '';

        const renderer = new Renderer(el, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const ctx = renderer.getContext();

        const stave = new Stave(2, 8, width - 6);
        if (showHeader) {
            stave.addClef('percussion').addTimeSignature(`${beats}/${unit}`);
        }
        stave.setContext(ctx).draw();

        // 手（バスドラム以外）と足（バスドラム）に分けて 2 声部にする。
        const hands = notes.filter((n) => n.drumKey !== 'BD');
        const feet = notes.filter((n) => n.drumKey === 'BD');

        const built = [];
        if (hands.length) built.push(buildVoice(hands, beats, unit, STEM_UP, 'g/5'));
        if (feet.length) built.push(buildVoice(feet, beats, unit, STEM_DOWN, 'd/4'));
        if (!built.length) built.push(buildVoice([], beats, unit, STEM_UP, 'b/4'));

        const voices = built.map((b) => b.voice);
        const formatWidth = Math.max(40, width - stave.getNoteStartX() - 12);
        new Formatter().joinVoices(voices).format(voices, formatWidth);

        voices.forEach((v) => v.draw(ctx, stave));
        built.forEach((b) => b.beams.forEach((beam) => beam.setContext(ctx).draw()));
    }, [notes, beats, unit, showHeader, height, width]);

    return <div ref={containerRef} className="w-full overflow-hidden rounded bg-white" />;
}
