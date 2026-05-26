import React, { useEffect, useRef, useState } from 'react';
import { measureSlots } from '../../constants/drumMap';

export const TAB_LABELS = {
    guitar: ['e', 'B', 'G', 'D', 'A', 'E'],
    bass: ['G', 'D', 'A', 'E'],
};

// 1 小節分のタブ譜を描画する（cells のキーは "M_S_R": measure_slot_stringRow）。
// コンテナ幅にフィットする（ドラム譜と横幅を揃えるため）。light=true で印刷向けの黒/白。
export default function MiniTab({ cells, measure, beats, unit, instrument = 'guitar', light = false }) {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setWidth(el.clientWidth);
        const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const labels = TAB_LABELS[instrument] || TAB_LABELS.guitar;
    const strings = labels.length;
    const total = measureSlots(beats, unit);
    const rowH = 17;
    const leftPad = 16;
    const rightPad = 6;
    const top = 10;
    const height = strings * rowH + top + 4;
    const w = width || 180;
    const innerW = w - leftPad - rightPad;
    const lineC = light ? '#000' : '#3f3f46';
    const txtC = light ? '#000' : '#22c55e';
    const lblC = light ? '#444' : '#71717a';
    const slotX = (s) => leftPad + (s + 0.5) * (innerW / total);

    const items = [];
    Object.entries(cells || {}).forEach(([k, fret]) => {
        const [M, S, R] = k.split('_').map(Number);
        if (M === measure) items.push({ S, R, fret });
    });

    return (
        <div ref={containerRef} className="w-full">
            <svg width={w} height={height} className="block">
                {labels.map((lbl, r) => {
                    const y = top + r * rowH;
                    return (
                        <g key={r}>
                            <line x1={leftPad} y1={y} x2={w - rightPad} y2={y} stroke={lineC} strokeWidth="0.8" />
                            <text x="0" y={y + 4} fontSize="11" fill={lblC}>
                                {lbl}
                            </text>
                        </g>
                    );
                })}
                {items.map((it, i) => (
                    <text
                        key={i}
                        x={slotX(it.S)}
                        y={top + it.R * rowH + 4}
                        fontSize="13"
                        fontWeight="bold"
                        fill={txtC}
                        textAnchor="middle"
                    >
                        {it.fret}
                    </text>
                ))}
            </svg>
        </div>
    );
}
