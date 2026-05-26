import React, { useState } from 'react';

// 再生・停止のトランスポート。画面左下に固定表示。メトロノーム(カウントイン)のON/OFFも切替。
export default function Transport({ isPlaying, onPlay, onStop, isPaused, onPause, onResume, metronome, onToggleMetronome, swing, onSwingChange, swingRatio, onSwingRatioChange, onExport, onExportVideo, prepStatus, videoPrepStatus, followTarget, onFollowTargetChange }) {
    const [format, setFormat] = useState('wav');
    const [exporting, setExporting] = useState(false);
    const [stage, setStage] = useState(null); // 'render' | 'encode' | 'analyze' | 'video' | 'audio'
    const [progress, setProgress] = useState(null); // 0..1 または null

    // 共通の書き出し実行ラッパ。run(onStage) を渡す。
    const runExport = async (run) => {
        if (exporting) return;
        setExporting(true);
        setStage('render');
        setProgress(null);
        try {
            await run((st, p) => {
                setStage(st);
                setProgress(p);
            });
        } catch (e) {
            console.error(e);
            alert(`書き出しに失敗しました: ${e.message ?? e}`);
        } finally {
            setExporting(false);
            setStage(null);
            setProgress(null);
        }
    };

    const handleExport = () => runExport((onStage) => onExport?.(format, onStage));
    const handleExportVideo = () => runExport((onStage) => onExportVideo?.(onStage));

    const stageLabel =
        {
            render: 'ミックスをレンダリング中…',
            analyze: '音声を解析中…',
            video: '動画をエンコード中…',
            audio: '音声を多重化中…',
            encode: `${format.toUpperCase()} に変換中…`,
        }[stage] ?? '処理中…';
    const pct = progress != null ? Math.round(progress * 100) : null;

    return (
        <>
            {exporting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="flex w-72 flex-col items-center gap-4 rounded-xl border border-zinc-700 bg-zinc-900 px-8 py-7 shadow-2xl">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-blue-500" />
                        <div className="text-sm font-semibold text-zinc-100">{stageLabel}</div>
                        {pct != null ? (
                            <div className="w-full">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-150"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <div className="mt-1 text-center text-xs tabular-nums text-zinc-400">{pct}%</div>
                            </div>
                        ) : (
                            <div className="text-xs text-zinc-400">しばらくお待ちください</div>
                        )}
                    </div>
                </div>
            )}

        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-2xl backdrop-blur">
            <button
                onClick={onPlay}
                disabled={isPlaying}
                className="rounded bg-green-600 px-4 py-1.5 text-sm font-semibold hover:bg-green-500 disabled:opacity-40"
            >
                ▶ 再生
            </button>
            <label className="flex items-center gap-1 text-[11px] text-zinc-400" title="再生中に追従する表示">
                追従
                <select
                    value={followTarget}
                    onChange={(e) => onFollowTargetChange?.(e.target.value)}
                    className="rounded bg-zinc-800 px-1.5 py-1 text-zinc-100 outline-none"
                >
                    <option value="drum">ドラム譜</option>
                    <option value="tab">録音/波形</option>
                </select>
            </label>
            {isPaused ? (
                <button
                    onClick={onResume}
                    className="rounded bg-green-600 px-4 py-1.5 text-sm font-semibold hover:bg-green-500"
                    title="続きから再生"
                >
                    ▶ 再開
                </button>
            ) : (
                <button
                    onClick={onPause}
                    disabled={!isPlaying}
                    className="rounded bg-amber-600 px-4 py-1.5 text-sm font-semibold hover:bg-amber-500 disabled:opacity-40"
                    title="一時停止"
                >
                    ⏸ 一時停止
                </button>
            )}
            <button
                onClick={onStop}
                disabled={!isPlaying && !isPaused}
                className="rounded bg-zinc-700 px-4 py-1.5 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-40"
            >
                ■ 停止
            </button>
            <button
                onClick={onToggleMetronome}
                className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    metronome ? 'bg-amber-600 hover:bg-amber-500' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
                title="メトロノーム（カウントイン）"
            >
                🎵{metronome ? 'ON' : 'OFF'}
            </button>
            <label className="flex items-center gap-1 text-xs text-zinc-400">
                Swing
                <select
                    value={swing}
                    onChange={(e) => onSwingChange?.(e.target.value)}
                    className="rounded bg-zinc-800 px-1.5 py-1 text-zinc-100 outline-none"
                >
                    <option value="0">なし</option>
                    <option value="8">8分</option>
                    <option value="16">16分</option>
                </select>
            </label>
            {swing !== '0' && (
                <label className="flex items-center gap-1 text-xs text-zinc-400" title="ハネ具合（前ノリの割合）">
                    比率
                    <input
                        type="range"
                        min="50"
                        max="80"
                        value={swingRatio}
                        onChange={(e) => onSwingRatioChange?.(Number(e.target.value))}
                        className="w-20 accent-amber-500"
                    />
                    <span className="w-8 tabular-nums">{swingRatio}%</span>
                </label>
            )}
            {isPlaying && <span className="text-xs text-green-400">再生中…</span>}

            <div className="ml-1 flex items-center gap-1 border-l border-zinc-700 pl-2">
                {prepStatus === 'preparing' && (
                    <span className="text-xs text-zinc-500" title="ミックスを事前準備中">準備中…</span>
                )}
                {prepStatus === 'ready' && (
                    <span className="text-xs text-green-400" title="事前準備が完了。書き出しが速くなります">⚡準備完了</span>
                )}
                <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    disabled={exporting}
                    className="rounded bg-zinc-800 px-1.5 py-1 text-xs text-zinc-100 outline-none disabled:opacity-40"
                    title="書き出し形式"
                >
                    <option value="wav">WAV</option>
                    <option value="mp3">MP3</option>
                </select>
                <button
                    onClick={handleExport}
                    disabled={exporting || isPlaying}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"
                    title="曲全体を音楽ファイルとして書き出す"
                >
                    {exporting ? '書き出し中…' : '⬇ 書き出し'}
                </button>
                <button
                    onClick={handleExportVideo}
                    disabled={exporting || isPlaying}
                    className="rounded bg-purple-600 px-3 py-1.5 text-sm font-semibold hover:bg-purple-500 disabled:opacity-40"
                    title={videoPrepStatus === 'ready' ? '動画は準備済み。すぐダウンロードできます' : '音楽に同期した幾何学ビジュアライザー動画(MP4)を書き出す'}
                >
                    🎬 動画{videoPrepStatus === 'ready' ? ' ⚡' : ''}
                </button>
                {(videoPrepStatus === 'preparing' || videoPrepStatus === 'checking') && (
                    <span className="text-[11px] text-zinc-500" title="動画をバックグラウンドで準備中">動画準備中…</span>
                )}
            </div>
        </div>
        </>
    );
}
