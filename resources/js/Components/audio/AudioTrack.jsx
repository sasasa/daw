import React, { useEffect, useRef, useState } from 'react';
import Waveform from './Waveform';
import TabEditor from './TabEditor';
import LyricsEditor from './LyricsEditor';
import api from '../../lib/api';
import { nearestSection, sectionRanges } from '../../lib/sections';
import { INSTRUMENTS, instrumentToTab, isVocal } from '../../constants/instruments';

// 1 本の録音トラック行。名前編集・単体再生・波形・タブ譜/歌詞入力・削除を担う。
export default function AudioTrack({ track, onChanged, playSec = null, playing = false, paused = false, onSeek, pattern = [], sections = [], bpm = 120, chords = {}, onChordsChange, lyrics = {}, onLyricsChange, innerRef }) {
    const [name, setName] = useState(track.name);
    const vocal = isVocal(name);
    const [previewing, setPreviewing] = useState(false); // 単体プレビュー再生中
    const [previewPaused, setPreviewPaused] = useState(false); // 単体プレビューを一時停止中
    const [previewSec, setPreviewSec] = useState(0); // 単体プレビューの再生位置(秒)
    const [showTab, setShowTab] = useState(!!track.notation);

    // 単体プレビューは Web Audio で再生する（録音の WebM は <audio> のシークが効かないため、
    // デコード済みバッファをオフセット指定で再生して一時停止・シークを正確に行う）。
    const ctxRef = useRef(null);
    const bufRef = useRef(null);
    const srcRef = useRef(null);
    const startedAtRef = useRef(0); // 再生開始時の AudioContext 時刻
    const startOffsetRef = useRef(0); // 再生開始時のバッファ内オフセット
    const rafRef = useRef(null);

    useEffect(() => setName(track.name), [track.name]);

    const getCtx = () => {
        if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        return ctxRef.current;
    };
    const ensureBuffer = async () => {
        if (bufRef.current) return bufRef.current;
        const res = await fetch(track.url);
        const ab = await res.arrayBuffer();
        bufRef.current = await getCtx().decodeAudioData(ab);
        return bufRef.current;
    };
    const stopSource = () => {
        if (srcRef.current) {
            try {
                srcRef.current.onended = null;
                srcRef.current.stop();
            } catch (_) { /* 既に停止 */ }
            srcRef.current = null;
        }
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };
    // offset(秒)から再生開始。
    const startAt = async (offset) => {
        const ctx = getCtx();
        await ctx.resume?.();
        const buf = await ensureBuffer();
        stopSource();
        const off = Math.min(Math.max(0, offset), Math.max(0, buf.duration - 0.02));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.onended = () => {
            if (srcRef.current === src) {
                // 自然に最後まで再生し終えた
                stopSource();
                setPreviewing(false);
                setPreviewPaused(false);
                setPreviewSec(0);
            }
        };
        src.start(0, off);
        srcRef.current = src;
        startedAtRef.current = ctx.currentTime;
        startOffsetRef.current = off;
        setPreviewing(true);
        setPreviewPaused(false);
        const tick = () => {
            const c = ctxRef.current;
            if (!c) return;
            setPreviewSec(startOffsetRef.current + (c.currentTime - startedAtRef.current));
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    // アンマウント時に後始末。
    useEffect(() => {
        return () => {
            stopSource();
            ctxRef.current?.close?.();
            ctxRef.current = null;
        };
    }, []);

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

    const durSec = (track.duration_ms || 0) / 1000 || 1;
    const offSec = (track.offset_ms || 0) / 1000;

    // このトラック単体の試聴。再生中に押すと一時停止（位置は保持）、もう一度で続きから。
    const togglePlay = () => {
        if (previewing) {
            const c = ctxRef.current;
            const pos = c ? startOffsetRef.current + (c.currentTime - startedAtRef.current) : previewSec;
            stopSource();
            setPreviewing(false);
            setPreviewPaused(true);
            setPreviewSec(Math.max(0, pos));
        } else {
            startAt(previewPaused ? previewSec : 0).catch((e) => console.error('preview play failed', e));
        }
    };

    // プレビューの再生位置を移動。再生中はその位置から鳴らし直し、一時停止中は位置だけ保持。
    const seekPreview = (t) => {
        const clamped = Math.max(0, Math.min(durSec, t));
        setPreviewSec(clamped);
        if (previewing) {
            startAt(clamped).catch(() => {});
        } else {
            setPreviewPaused(true);
            startOffsetRef.current = clamped;
        }
    };

    // 一時停止中、波形上をドラッグして再生位置をずらす。
    // 単体プレビュー一時停止中はこのトラックの位置を、全体一時停止中は曲全体の位置を動かす。
    const canSeek = previewPaused || (paused && !!onSeek);
    const seekFromEvent = (clientX, rectEl) => {
        const rect = rectEl.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        if (previewPaused) {
            seekPreview(frac * durSec);
        } else if (paused && onSeek) {
            onSeek(offSec + frac * durSec);
        }
    };
    const onWaveMouseDown = (e) => {
        if (!canSeek) return;
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

    // 再生線の位置(%)。全体再生/一時停止が優先、無ければ単体プレビュー（再生中・一時停止中とも表示）。
    let playheadPct = null;
    if (playing || paused) {
        const rel = playSec != null ? playSec - offSec : null;
        const relSec = rel != null && rel >= 0 && rel <= durSec ? rel : null;
        playheadPct = relSec != null ? (relSec / durSec) * 100 : null;
    } else if (previewing || previewPaused) {
        playheadPct = Math.min(100, Math.max(0, (previewSec / durSec) * 100));
    }

    return (
        <div ref={innerRef} className="border-b border-zinc-800 px-3 py-2">
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
                        className={`relative ${canSeek ? 'cursor-ew-resize' : ''}`}
                        onMouseDown={onWaveMouseDown}
                        title={canSeek ? 'ドラッグで再生位置を移動' : undefined}
                    >
                        <Waveform url={track.url} />
                        {playheadPct != null && (
                            <div
                                className="pointer-events-none absolute top-0 h-full w-0.5 bg-amber-400"
                                style={{ left: `${playheadPct}%` }}
                            >
                                {canSeek && (
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
            </div>
        </div>
    );
}
