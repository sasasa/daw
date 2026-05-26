import React from 'react';

// ボーカルトラック用の歌詞エディタ。小節ごとにテキストを入力する。
// 歌詞は曲レベル（{ 小節番号: テキスト }）で持ち、印刷譜面・動画でも利用する。
export default function LyricsEditor({ measures = [], lyrics = {}, onLyricsChange }) {
    const setLyric = (m, val) => {
        const next = { ...lyrics };
        if (val.trim() === '') delete next[m];
        else next[m] = val;
        onLyricsChange?.(next);
    };

    return (
        <div className="mt-1 rounded bg-zinc-950 p-2">
            <div className="mb-1 text-[11px] text-zinc-400">歌詞（小節ごと）</div>

            {measures.length === 0 && (
                <p className="text-[11px] text-zinc-600">このトラックの担当小節がありません（セクション設定が必要）</p>
            )}

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {measures.map((m) => (
                    <div key={m.measure} className="rounded border border-zinc-800 p-1">
                        <div className="mb-0.5 text-[9px] text-zinc-600">小節 {m.measure}</div>
                        <input
                            value={lyrics[m.measure] ?? ''}
                            onChange={(e) => setLyric(m.measure, e.target.value)}
                            placeholder="歌詞"
                            className="w-full rounded bg-zinc-800 px-1.5 py-1 text-sm text-zinc-100 outline-none focus:bg-zinc-700"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
