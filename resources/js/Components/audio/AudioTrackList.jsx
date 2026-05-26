import React, { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import AudioTrack from './AudioTrack';
import { useRecorder } from '../../hooks/useRecorder';
import api from '../../lib/api';
import { sectionRanges, sectionStartSeconds, measureStartSeconds, nearestSection } from '../../lib/sections';
import { INSTRUMENTS } from '../../constants/instruments';

function formatElapsed(ms) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function formatSec(sec) {
    const total = Math.round(sec);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// 録音トラック一覧 + 多チャンネル録音。
// 入力デバイス（チャンネル）とチャンネル名、開始セクションを選んで録音する。
// 録音は選んだセクションの開始時刻に offset_ms を合わせて配置する。
export default function AudioTrackList({ song, audioTracks, bpm, pattern, sections, chords, onChordsChange, lyrics, onLyricsChange, onRecordPlay, onStopPlay, onGetLatency, onAudioChanged, onAudioAdded, onRecordingStateChange, playSec, playing, paused, onSeek, followTarget, onFollowTargetChange, viewSectionId = '', onViewSectionChange }) {
    const { isRecording, elapsedMs, prepare, begin, stop } = useRecorder();
    const [uploading, setUploading] = useState(false);
    const [counting, setCounting] = useState(false);
    const autoStopRef = useRef(null);
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [channelName, setChannelName] = useState(INSTRUMENTS[0]);
    const [startSectionId, setStartSectionId] = useState(''); // '' = 曲頭
    const setViewSectionId = (id) => onViewSectionChange?.(id); // 表示セクションは親と共有
    const [collapsed, setCollapsed] = useState(() => new Set()); // 折りたたみ中の楽器グループ

    const ranges = sectionRanges(sections);

    // 表示セクションで録音トラックを絞り込む（offset がその区間に入るもの）。
    const viewRange = ranges.find((r) => r.id === viewSectionId) ?? null;
    // 全体表示では、同じ楽器（名前）をまとめてグループ化する（「(コピー)」は同一楽器扱い）。
    // 返り値は [{ key, tracks }]。各グループ内はセクション順(offset順)、グループ順は最初の位置順。
    const instrumentGroups = () => {
        const key = (t) => (t.name || '').replace(/(\s*\(コピー\))+$/, '').trim() || '(無名)';
        const map = new Map();
        audioTracks.forEach((t) => {
            const k = key(t);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(t);
        });
        const groups = [...map.entries()].map(([k, ts]) => ({
            key: k,
            tracks: ts.slice().sort((a, b) => (a.offset_ms || 0) - (b.offset_ms || 0)),
        }));
        groups.sort((a, b) => (a.tracks[0].offset_ms || 0) - (b.tracks[0].offset_ms || 0));
        return groups;
    };

    const sectionTracks = viewRange
        ? audioTracks.filter((t) => {
              const near = nearestSection((t.offset_ms || 0) / 1000, pattern, bpm, sections);
              return near?.range.id === viewRange.id;
          })
        : null;
    const groups = viewRange ? null : instrumentGroups();

    const toggleGroup = (k) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.has(k) ? next.delete(k) : next.add(k);
            return next;
        });

    // 入力デバイスを列挙（ラベルは一度マイク許可すると取得できる）。
    const refreshDevices = async () => {
        try {
            const list = await navigator.mediaDevices.enumerateDevices();
            setDevices(list.filter((d) => d.kind === 'audioinput'));
        } catch (e) {
            console.error('enumerateDevices failed', e);
        }
    };
    useEffect(() => {
        refreshDevices();
    }, []);

    const startOffsetMs = () => {
        if (!startSectionId) return 0;
        const range = ranges.find((r) => r.id === startSectionId);
        return range ? Math.round(sectionStartSeconds(pattern, bpm, range, sections) * 1000) : 0;
    };

    // 選んだ開始セクションが「最後でない」場合、その区間の長さ(ms)を返す（区間でのみ録音）。
    const sectionLimitMs = () => {
        if (!startSectionId) return null; // 曲頭は無制限
        const idx = ranges.findIndex((r) => r.id === startSectionId);
        if (idx < 0 || idx === ranges.length - 1) return null; // 最後のセクションは無制限
        const r = ranges[idx];
        const dur =
            measureStartSeconds(pattern, bpm, r.end + 1, sections) -
            measureStartSeconds(pattern, bpm, r.start, sections);
        return Math.round(dur * 1000);
    };

    const beginRecording = async () => {
        try {
            // 入力を準備 → カウントイン＋ドラム再生 → 開始点ちょうどに録音開始。
            await prepare(deviceId || undefined);
            refreshDevices(); // 初回許可後はデバイスラベルが取れる
            setCounting(true);
            const limitMs = sectionLimitMs();
            onRecordPlay?.({
                startSeconds: startOffsetMs() / 1000,
                onStart: () => {
                    setCounting(false);
                    begin();
                    onRecordingStateChange?.(true);
                    // 非最後セクションは区間終わりで自動停止。
                    if (limitMs) {
                        autoStopRef.current = setTimeout(() => finishRecording(), limitMs);
                    }
                },
            });
        } catch (e) {
            setCounting(false);
            alert('マイク/入力へのアクセスが許可されていません。');
            console.error(e);
        }
    };

    const finishRecording = async () => {
        if (autoStopRef.current) {
            clearTimeout(autoStopRef.current);
            autoStopRef.current = null;
        }
        onStopPlay?.(); // ドラム再生を停止
        const result = await stop();
        onRecordingStateChange?.(false);
        if (!result || result.blob.size === 0) return;

        const name = channelName.trim() || `Ch ${audioTracks.length + 1}`;
        const ext = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
        // レイテンシ補正: 録音は出力＋入力遅延ぶん後ろにずれるので、配置を前へ詰める。
        const compMs = Math.round((onGetLatency?.() ?? 0) * 2 * 1000);
        const offsetMs = Math.max(0, startOffsetMs() - compMs);
        const fd = new FormData();
        fd.append('audio', result.blob, `recording.${ext}`);
        fd.append('name', name);
        fd.append('duration_ms', String(result.durationMs));
        fd.append('offset_ms', String(offsetMs));

        setUploading(true);
        try {
            const res = await api.post(route('audio-tracks.store', song.id), fd);
            // 返ってきた新トラックを即座に一覧へ追加（リロード不要）。
            if (res?.data?.id) onAudioAdded?.(res.data);
            else onAudioChanged?.();
        } catch (e) {
            console.error('upload failed', e);
        } finally {
            setUploading(false);
        }
    };

    return (
        <section className="rounded-lg bg-zinc-900">
            <div className="flex flex-wrap items-end gap-2 border-b border-zinc-800 px-3 py-2">
                <h2 className="mr-2 text-sm font-bold tracking-wide text-zinc-300">AUDIO TRACKS</h2>

                <label className="flex flex-col text-xs text-zinc-400">
                    入力
                    <select
                        value={deviceId}
                        onChange={(e) => setDeviceId(e.target.value)}
                        disabled={isRecording}
                        className="mt-0.5 max-w-44 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                    >
                        <option value="">既定の入力</option>
                        {devices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                                {d.label || `入力 ${i + 1}`}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col text-xs text-zinc-400">
                    チャンネル名
                    <select
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                        disabled={isRecording}
                        className="mt-0.5 w-32 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                    >
                        {INSTRUMENTS.map((inst) => (
                            <option key={inst} value={inst}>{inst}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col text-xs text-zinc-400">
                    開始
                    <select
                        value={startSectionId}
                        onChange={(e) => setStartSectionId(e.target.value)}
                        disabled={isRecording}
                        className="mt-0.5 rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none"
                    >
                        <option value="">曲頭 (0:00)</option>
                        {ranges.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name} (小節{r.start}〜 {formatSec(sectionStartSeconds(pattern, bpm, r, sections))})
                            </option>
                        ))}
                    </select>
                </label>

            </div>

            {/* 録音ボタンは画面右下に固定 */}
            <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg bg-zinc-900/95 px-2 py-1.5 shadow-2xl backdrop-blur">
                {isRecording ? (
                    <button
                        onClick={finishRecording}
                        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold shadow-2xl hover:bg-red-500"
                    >
                        ■ 停止 <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>
                    </button>
                ) : (
                    <button
                        onClick={beginRecording}
                        disabled={uploading || counting}
                        className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold shadow-2xl hover:bg-red-600 disabled:opacity-50"
                    >
                        {counting ? 'カウント…' : '● 録音'}
                    </button>
                )}
            </div>

            {/* セクション表示切替: 選ぶとその区間の録音だけになる。 */}
            {ranges.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 px-3 py-2 text-xs">
                    <span className="text-zinc-500">表示:</span>
                    <button
                        onClick={() => setViewSectionId('')}
                        className={`rounded px-2 py-1 ${viewSectionId === '' ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    >
                        全体
                    </button>
                    {ranges.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => setViewSectionId(r.id)}
                            className={`rounded px-2 py-1 ${viewSectionId === r.id ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                        >
                            {r.name}({r.measures})
                        </button>
                    ))}
                </div>
            )}

            {uploading && <p className="px-3 py-2 text-sm text-zinc-400">アップロード中…</p>}

            {audioTracks.length === 0 && !uploading && (
                <p className="px-3 py-6 text-center text-sm text-zinc-600">録音トラックがありません</p>
            )}

            {/* セクション表示: フラット一覧 */}
            {viewRange &&
                (sectionTracks.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-zinc-600">
                        {viewRange.name} の録音トラックがありません
                    </p>
                ) : (
                    sectionTracks.map((track) => (
                        <AudioTrack
                            key={track.id}
                            track={track}
                            onChanged={onAudioChanged}
                            playSec={playSec}
                            playing={playing}
                            paused={paused}
                            onSeek={onSeek}
                            pattern={pattern}
                            sections={sections}
                            bpm={bpm}
                            chords={chords}
                            onChordsChange={onChordsChange}
                            lyrics={lyrics}
                            onLyricsChange={onLyricsChange}
                        />
                    ))
                ))}

            {/* 全体表示: 楽器ごとにグループ化（間隔・折りたたみ） */}
            {!viewRange &&
                groups.map((g) => {
                    const isCollapsed = collapsed.has(g.key);
                    return (
                        <div key={g.key} className="border-t-4 border-zinc-950">
                            <button
                                onClick={() => toggleGroup(g.key)}
                                className="flex w-full items-center gap-2 bg-zinc-800/60 px-3 py-1.5 text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                            >
                                <span>{isCollapsed ? '▶' : '▼'}</span>
                                {g.key}
                                <span className="text-zinc-500">({g.tracks.length})</span>
                            </button>
                            {!isCollapsed &&
                                g.tracks.map((track) => (
                                    <AudioTrack
                                        key={track.id}
                                        track={track}
                                        onChanged={onAudioChanged}
                                        playSec={playSec}
                                        playing={playing}
                                        paused={paused}
                                        onSeek={onSeek}
                                        pattern={pattern}
                                        sections={sections}
                                        bpm={bpm}
                                        chords={chords}
                                        onChordsChange={onChordsChange}
                                        lyrics={lyrics}
                                        onLyricsChange={onLyricsChange}
                                    />
                                ))}
                        </div>
                    );
                })}
        </section>
    );
}
