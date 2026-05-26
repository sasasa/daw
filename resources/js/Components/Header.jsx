import React from 'react';
import { Link, router } from '@inertiajs/react';

// エディタ上部のヘッダー。曲名・BPM・拍子を編集する。値は自動保存される。
const BEAT_UNITS = [1, 2, 4, 8, 16];

export default function Header({ songId, meta, onChange, onTimeSignature, saveState }) {
    const set = (key, value) => onChange({ ...meta, [key]: value });
    const beatUnit = meta.beat_unit ?? 4;

    const destroy = () => {
        if (confirm(`「${meta.title}」を削除しますか？`)) {
            router.delete(route('songs.destroy', songId));
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
            <Link href={route('songs.index')} className="text-sm text-zinc-400 hover:text-green-400">
                ← 曲一覧
            </Link>
            <input
                value={meta.title}
                onChange={(e) => set('title', e.target.value)}
                className="rounded bg-zinc-800 px-3 py-1.5 font-semibold outline-none"
            />
            <label className="flex items-center gap-2 text-sm text-zinc-400">
                BPM
                <input
                    type="number"
                    min="20"
                    max="300"
                    value={meta.bpm}
                    onChange={(e) => set('bpm', Number(e.target.value))}
                    className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 outline-none"
                />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-400">
                拍子
                <span className="flex items-center gap-1">
                    <input
                        type="number"
                        min="1"
                        max="16"
                        value={meta.beats_per_measure}
                        onChange={(e) =>
                            onTimeSignature?.(Math.max(1, Math.min(16, Number(e.target.value) || 1)), beatUnit)
                        }
                        className="w-14 rounded bg-zinc-800 px-2 py-1.5 text-center text-zinc-100 outline-none"
                        title="分子（1小節の拍数）"
                    />
                    <span className="text-zinc-500">/</span>
                    <select
                        value={beatUnit}
                        onChange={(e) => onTimeSignature?.(meta.beats_per_measure, Number(e.target.value))}
                        className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 outline-none"
                        title="分母（音価）"
                    >
                        {BEAT_UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </span>
            </label>
            <span className="text-xs text-zinc-500">
                {saveState === 'saving' ? '保存中…' : '自動保存済み'}
            </span>
            <a
                href={route('songs.print', songId)}
                target="_blank"
                rel="noopener"
                className="ml-auto rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
            >
                印刷
            </a>
            <button
                type="button"
                onClick={destroy}
                className="rounded px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-800"
            >
                削除
            </button>
        </div>
    );
}
