import React, { useEffect, useRef, useState } from 'react';
import Waveform from './Waveform';
import TabEditor from './TabEditor';
import LyricsEditor from './LyricsEditor';
import api from '../../lib/api';
import { nearestSection, sectionRanges } from '../../lib/sections';
import { INSTRUMENTS, instrumentToTab, isVocal } from '../../constants/instruments';

// 1 本の録音トラック行。名前編集・単体再生・波形・タブ譜/歌詞入力・削除を担う。
export default function AudioTrack({ track, onChanged, playSec = null, playing = false, paused = false, onSeek, pattern = [], sections = [], bpm = 120, chords = {}, onChordsChange, lyrics = {}, onLyricsChange }) {
    const [name, setName] = useState(track.name);
    const vocal = isVocal(name);
    const [previewing, setPreviewing] = useState(false);
    const [previewSec, setPreviewSec] = useState(0); // 単体プレビューの再生位置(秒)
    const [showTab, setShowTab] = useState(!!track.notation);
    const audioRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => setName(track.name), [track.name]);

    // 単体プレビュー中は <audio> の再生位置を追従して再生線を動かす。
    useEffect(() => {
        if (!previewing) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            return;
        }
        const tick = () => {
            const el = audioRef.current;
            if (el) setPreviewSec(el.currentTime);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [previewing]);

    const saveName = async (value) => {
        const trimmed = (value ?? name).trim();
        if (!trimmed || trimmed === track.name) {
            setName(track.name);
            return;
        }
        setName(trimmed);
        await api.patch(route('audio-tracks.update', track.id), { name: trimmed });
        onChanged?.();
    };

    // タブ譜(JSON)を保存（一覧の再取得はしない＝入力欄を保持）。
    const saveNotation = async (value) => {
        try {
            await api.patch(route('audio-tracks.update', track.id), { notation: value });
        } catch (e) {
            console.error('notation save failed', e);
        }
    };

    const destroy = async () => {
        if (!confirm(`トラック「${track.name}」を削除しますか？`)) return;
        await api.delete(route('audio-tracks.destroy', track.id));
        onChanged?.();
    };

    // このトラック単体の試聴。再生中に押すと一時停止（位置は保持）、もう一度で続きから。
    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        if (previewing) el.pause();
        else el.play().catch(() => {});
    };

    const durSec = (track.duration_ms || 0) / 1000 || 1;
    const offSec = (track.offset_ms || 0) / 1000;

    // 一時停止中、波形上をドラッグして全体の再生位置をずらす（このトラックの担当範囲内）。
    const seekFromEvent = (clientX, rectEl) => {
        const rect = rectEl.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        onSeek?.(offSec + frac * durSec);
    };
    const onWaveMouseDown = (e) => {
        if (!paused || !onSeek) return;
        const rectEl = e.currentTarget;
        seekFromEvent(e.clientX, rectEl);
        const onMove = (ev) => seekFromEvent(ev.clientX, rectEl);
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // このトラックが担当するセクションの小節（無ければ曲全体）。
    const near = nearestSection(offSec, pattern, bpm, sections);
    const range = near?.range;
    const coveredMeasures = range
        ? pattern.filter((m) => m.measure >= range.start && m.measure <= range.end)
        : pattern;

    // 再生線の位置(%)。単体プレビュー中はそのトラックの再生位置、
    // 全体再生/一時停止中は曲全体の再生位置から算出する。
    let playheadPct = null;
    if (previewing) {
        playheadPct = Math.min(100, Math.max(0, (previewSec / durSec) * 100));
    } else {
        const rel = (playing || paused) && playSec != null ? playSec - offSec : null;
        const relSec = rel != null && rel >= 0 && rel <= durSec ? rel : null;
        playheadPct = relSec != null ? (relSec / durSec) * 100 : null;
    }

    return (
        <div className="border-b border-zinc-800 px-3 py-2">
            <div className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                    <select
                        value={INSTRUMENTS.includes(name) ? name : '__other'}
                        onChange={(e) => saveName(e.target.value)}
                        className="w-full rounded bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-100 outline-none focus:bg-zinc-700"
                    >
                        {INSTRUMENTS.map((inst) => (
                            <option key={inst} value={inst}>{inst}</option>
                        ))}
                        {!INSTRUMENTS.includes(name) && <option value="__other">{name}</option>}
                    </select>
                    <div className="mt-0.5 text-xs text-zinc-500">{(track.duration_ms / 1000).toFixed(1)}s</div>
                    <button
                        onClick={() => setShowTab((v) => !v)}
                        className={`mt-1 rounded px-1.5 py-0.5 text-[10px] ${showTab ? 'bg-green-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        {vocal ? '歌詞' : 'コード/タブ'}
                    </button>
                </div>

                <button
                    onClick={togglePlay}
                    className={`shrink-0 rounded px-2 py-1 text-sm font-semibold ${
                        previewing ? 'bg-red-600 hover:bg-red-500' : 'bg-green-700 hover:bg-green-600'
                    }`}
                    title={previewing ? '一時停止' : 'このトラックを試聴'}
                >
                    {previewing ? '⏸' : '▶'}
                </button>

                <div className="min-w-0 flex-1">
                    <div
                        className={`relative ${paused && onSeek ? 'cursor-ew-resize' : ''}`}
                        onMouseDown={onWaveMouseDown}
                        title={paused ? 'ドラッグで再生位置を移動' : undefined}
                    >
                        <Waveform url={track.url} />
                        {playheadPct != null && (
                            <div
                                className="pointer-events-none absolute top-0 h-full w-0.5 bg-amber-400"
                                style={{ left: `${playheadPct}%` }}
                            >
                                {paused && (
                                    <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
                                )}
                            </div>
                        )}
                    </div>
                    {showTab && (
                        vocal ? (
                            <LyricsEditor
                                measures={coveredMeasures}
                                lyrics={lyrics}
                                onLyricsChange={onLyricsChange}
                            />
                        ) : (
                            <TabEditor
                                notation={track.notation}
                                onSave={saveNotation}
                                measures={coveredMeasures}
                                chords={chords}
                                onChordsChange={onChordsChange}
                                instrument={instrumentToTab(name)}
                            />
                        )
                    )}
                </div>

                <button
                    onClick={destroy}
                    className="shrink-0 rounded px-2 py-1 text-sm text-red-400 hover:bg-zinc-800"
                >
                    🗑
                </button>

                <audio
                    ref={audioRef}
                    src={track.url}
                    onPlay={() => setPreviewing(true)}
                    onPause={() => setPreviewing(false)}
                    onEnded={() => setPreviewing(false)}
                    preload="none"
                />
            </div>
        </div>
    );
}
