import React from 'react';
import { DURATIONS } from '../../constants/drumMap';

// 音価選択 + 消しゴム。選択中のツールでグリッドのセルを打ち込む。
export default function NotePalette({ tool, onSelect }) {
    const base = 'rounded px-3 py-1.5 text-sm font-semibold border';
    const cls = (active) =>
        active
            ? `${base} border-green-500 bg-green-600 text-white`
            : `${base} border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700`;

    return (
        <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
                <button key={d.value} onClick={() => onSelect(d.value)} className={cls(tool === d.value)}>
                    {d.label}
                </button>
            ))}
            <button onClick={() => onSelect('erase')} className={cls(tool === 'erase')}>
                ✕ 消しゴム
            </button>
        </div>
    );
}
