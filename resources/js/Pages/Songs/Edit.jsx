import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import Header from '../../Components/Header';
import Transport from '../../Components/Transport';
import HorizontalScore from '../../Components/HorizontalScore';
import SectionEditor from '../../Components/SectionEditor';
import AudioTrackList from '../../Components/audio/AudioTrackList';
import DrumEditor from '../../Components/drum/DrumEditor';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { measureStartSeconds } from '../../lib/sections';
import { sixteenthsPerBeat } from '../../constants/drumMap';
import { exportSong, downloadUrl } from '../../lib/exportAudio';
import { exportVideo } from '../../lib/exportVideo';
import { useExportPrep } from '../../hooks/useExportPrep';
import api from '../../lib/api';

// パターンを初期化し、各小節に拍子（beats/unit）を補完する。
function initialPattern(drumTrack, song) {
    const base = drumTrack?.pattern?.length ? drumTrack.pattern : [{ measure: 1, notes: [] }];
    return base.map((m) => ({
        measure: m.measure,
        beats: m.beats ?? song.beats_per_measure ?? 4,
        unit: m.unit ?? song.beat_unit ?? 4,
        notes: m.notes ?? [],
    }));
}

// メインエディタ。ヘッダー・トランスポート・曲構成・録音トラック・ドラムを統合する。
export default function Edit({ song, audioTracks: initialAudioTracks, drumTrack }) {
    // 録音一覧はクライアント状態として持ち、操作後は JSON 取得で即時更新する。
    const [audioTracks, setAudioTracks] = useState(initialAudioTracks);
    const refreshAudio = () =>
        api
            .get(route('audio-tracks.index', song.id))
            .then((r) => setAudioTracks(r.data))
            .catch(() => {});

    const [pattern, setPattern] = useState(() => initialPattern(drumTrack, song));
    const [sections, setSections] = useState(() => song.sections ?? []);
    const [chords, setChords] = useState(() => song.chords ?? {});
    const [lyrics, setLyrics] = useState(() => song.lyrics ?? {});
    const [swing, setSwing] = useState(() => song.swing ?? '0');
    const [swingRatio, setSwingRatio] = useState(() => song.swing_ratio ?? 66);
    const [meta, setMeta] = useState({
        title: song.title,
        bpm: song.bpm,
        beats_per_measure: song.beats_per_measure,
        beat_unit: song.beat_unit ?? 4,
    });

    // 一番上の拍子（何分の何）を変更したら、全小節の拍子も合わせて書き換える（範囲外の音は除外）。
    const handleTimeSignature = (beats, unit) => {
        setMeta((m) => ({ ...m, beats_per_measure: beats, beat_unit: unit }));
        const spb = sixteenthsPerBeat(unit);
        setPattern((prev) =>
            prev.map((mm) => ({
                ...mm,
                beats,
                unit,
                notes: (mm.notes ?? []).filter(
                    (n) => n.beat >= 1 && n.beat <= beats && n.subdivision >= 0 && n.subdivision < spb
                ),
            }))
        );
    };
    const [metronome, setMetronome] = useState(true);
    const [prepOverlayHidden, setPrepOverlayHidden] = useState(false); // 準備中オーバーレイをXで閉じたか
    const [horizontalOpen, setHorizontalOpen] = useState(false); // 横再生ビュー
    const [saveState, setSaveState] = useState('saved'); // 'saved' | 'saving'
    const [followTarget, setFollowTarget] = useState('tab'); // 'drum' | 'tab'（既定は波形/録音）
    const [viewSectionId, setViewSectionId] = useState(''); // 表示セクション（ドラム/録音で共有）
    const { isPlaying, isPaused, play, stop, pause, resume, seek, triggerPreview, currentMeasure, currentSeconds, getLatencySeconds } =
        useAudioEngine();

    // 自動保存: pattern / sections / meta が変わったら少し待って保存（ボタン不要）。
    const firstRender = useRef(true);
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        setSaveState('saving');
        const id = setTimeout(() => {
            api
                .put(route('songs.autosave', song.id), {
                    title: meta.title,
                    bpm: meta.bpm,
                    beats_per_measure: meta.beats_per_measure,
                    beat_unit: meta.beat_unit,
                    sections,
                    chords,
                    lyrics,
                    swing,
                    swing_ratio: swingRatio,
                    pattern,
                })
                .then(() => setSaveState('saved'))
                .catch(() => setSaveState('saved'));
        }, 700);
        return () => clearTimeout(id);
    }, [pattern, sections, chords, lyrics, swing, swingRatio, meta, song.id]);

    // startSeconds〜stopSeconds を再生（省略時は曲頭〜最後）。
    const handlePlay = (startSeconds = 0, stopSeconds = null) => {
        play({
            audioTracks,
            drumPattern: pattern,
            bpm: meta.bpm,
            beatsPerMeasure: meta.beats_per_measure,
            sections,
            swing,
            swingRatio,
            metronome,
            startSeconds,
            stopSeconds,
        });
    };

    // セクション先頭から最後まで再生（表示はそのセクションに切替）。
    const playFromSection = (range) => {
        setViewSectionId(range.id);
        handlePlay(measureStartSeconds(pattern, meta.bpm, range.start, sections));
    };

    // そのセクションのみ再生（表示はそのセクションに切替）。
    const playSectionOnly = (range) => {
        setViewSectionId(range.id);
        const start = measureStartSeconds(pattern, meta.bpm, range.start, sections);
        const end = measureStartSeconds(pattern, meta.bpm, range.end + 1, sections);
        handlePlay(start, end);
    };

    // 1 小節だけドラムを再生（カウントインなし）。
    const playMeasure = (measure) => {
        const start = measureStartSeconds(pattern, meta.bpm, measure, sections);
        const end = measureStartSeconds(pattern, meta.bpm, measure + 1, sections);
        play({
            audioTracks: [],
            drumPattern: pattern,
            bpm: meta.bpm,
            beatsPerMeasure: meta.beats_per_measure,
            sections,
            swing,
            swingRatio,
            metronome: false,
            startSeconds: start,
            stopSeconds: end,
        });
    };

    // 書き出し対象のミックスパラメータ（音声・動画で共通）。
    const mixParams = useMemo(
        () => ({
            audioTracks,
            drumPattern: pattern,
            bpm: meta.bpm,
            beatsPerMeasure: meta.beats_per_measure,
            sections,
            swing,
            swingRatio,
        }),
        [audioTracks, pattern, meta.bpm, meta.beats_per_measure, sections, swing, swingRatio]
    );

    // 編集が落ち着いたらミックスをバックグラウンドでレンダリングし、サーバーに保存しておく。
    // リロード時はサーバーキャッシュを取得するだけで済む。
    const prep = useExportPrep(song.id, mixParams, { lyrics });

    // 新しい準備（音声・動画）が始まったらオーバーレイの非表示状態をリセット（次回は再表示）。
    useEffect(() => {
        if (prep.status === 'preparing' || prep.videoStatus === 'preparing') setPrepOverlayHidden(false);
    }, [prep.status, prep.videoStatus]);

    // 曲全体をミックスして音楽ファイル（WAV/MP3）として書き出す。
    const handleExport = async (format, onStage) => {
        const buffer = await prep.getBuffer();
        return exportSong(mixParams, { format, filename: meta.title, onStage, buffer });
    };

    // 曲全体に同期した幾何学ビジュアライザー動画を書き出す。
    // 事前生成済みのキャッシュがあればサーバーから即ダウンロード、無ければその場で生成。
    const handleExportVideo = async (onStage) => {
        const cached = await prep.getVideo();
        if (cached?.url) {
            const base = (meta.title || 'song').replace(/[\\/:*?"<>|]/g, '_').trim() || 'song';
            downloadUrl(cached.url, `${base}.${cached.format}`);
            return;
        }
        const buffer = await prep.getBuffer();
        return exportVideo(mixParams, { filename: meta.title, onStage, buffer, lyrics });
    };

    // 録音用: カウントイン後にドラム＋既存の多重録音トラックを鳴らし、開始点で onStart を発火。
    const recordPlay = ({ startSeconds, onStart }) =>
        play({
            audioTracks,
            drumPattern: pattern,
            bpm: meta.bpm,
            beatsPerMeasure: meta.beats_per_measure,
            sections,
            swing,
            swingRatio,
            metronome: true,
            startSeconds,
            onStart,
        });

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <Head title={meta.title} />

            {/* バックグラウンドの準備中（音声ミックス/動画）は全画面ローディング表示。Xで閉じて作業を続けられる。 */}
            {(prep.status === 'preparing' || prep.videoStatus === 'preparing') && !prepOverlayHidden && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-8 py-6 shadow-2xl">
                        <button
                            onClick={() => setPrepOverlayHidden(true)}
                            className="absolute right-2 top-2 rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                            title="閉じて作業を続ける（準備はバックグラウンドで継続）"
                        >
                            ✕
                        </button>
                        <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-600 border-t-blue-500" />
                        {prep.status === 'preparing' ? (
                            <>
                                <div className="text-sm font-semibold text-zinc-100">書き出しデータを準備中…</div>
                                <div className="text-xs text-zinc-500">ミックスをレンダリングしています</div>
                            </>
                        ) : (
                            <>
                                <div className="text-sm font-semibold text-zinc-100">動画を準備中…</div>
                                <div className="text-xs text-zinc-500">動画をエンコードしています</div>
                            </>
                        )}
                        <div className="text-[11px] text-zinc-600">✕ で閉じても準備は続きます</div>
                    </div>
                </div>
            )}
            <HorizontalScore
                open={horizontalOpen}
                onClose={() => {
                    stop();
                    setHorizontalOpen(false);
                }}
                title={meta.title}
                pattern={pattern}
                sections={sections}
                chords={chords}
                lyrics={lyrics}
                audioTracks={audioTracks}
                bpm={meta.bpm}
                currentMeasure={currentMeasure}
                currentSeconds={currentSeconds}
                isPlaying={isPlaying}
                isPaused={isPaused}
                onPlay={() => handlePlay(0)}
                onStop={stop}
                onPause={pause}
                onResume={resume}
                onSeekMeasure={(measure) => {
                    const start = measureStartSeconds(pattern, meta.bpm, measure, sections);
                    if (isPaused) seek(start);
                    else play({ ...mixParams, metronome: false, startSeconds: start });
                }}
            />
            <Header songId={song.id} meta={meta} onChange={setMeta} onTimeSignature={handleTimeSignature} saveState={saveState} />
            <Transport
                isPlaying={isPlaying}
                onPlay={() => {
                    setViewSectionId(''); // 全体表示に切り替えてから先頭再生
                    handlePlay(0);
                }}
                onStop={stop}
                isPaused={isPaused}
                onPause={pause}
                onResume={resume}
                onHorizontal={() => {
                    setViewSectionId('');
                    setHorizontalOpen(true);
                    handlePlay(0);
                }}
                metronome={metronome}
                onToggleMetronome={() => setMetronome((v) => !v)}
                swing={swing}
                onSwingChange={setSwing}
                swingRatio={swingRatio}
                onSwingRatioChange={setSwingRatio}
                onExport={handleExport}
                onExportVideo={handleExportVideo}
                prepStatus={prep.status}
                videoPrepStatus={prep.videoStatus}
                followTarget={followTarget}
                onFollowTargetChange={setFollowTarget}
            />

            <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
                <SectionEditor
                    songId={song.id}
                    sections={sections}
                    onChange={setSections}
                    pattern={pattern}
                    onPatternChange={setPattern}
                    bpm={meta.bpm}
                    audioTracks={audioTracks}
                    onPlayOnly={playSectionOnly}
                    onPlayFrom={playFromSection}
                    onAudioChanged={refreshAudio}
                />
                <AudioTrackList
                    song={song}
                    audioTracks={audioTracks}
                    bpm={meta.bpm}
                    pattern={pattern}
                    sections={sections}
                    chords={chords}
                    onChordsChange={setChords}
                    lyrics={lyrics}
                    onLyricsChange={setLyrics}
                    onRecordPlay={recordPlay}
                    onStopPlay={stop}
                    onGetLatency={getLatencySeconds}
                    onAudioChanged={refreshAudio}
                    onAudioAdded={(t) => setAudioTracks((prev) => [t, ...prev])}
                    playSec={currentSeconds}
                    playing={isPlaying}
                    paused={isPaused}
                    onSeek={seek}
                    followTarget={followTarget}
                    onFollowTargetChange={setFollowTarget}
                    viewSectionId={viewSectionId}
                    onViewSectionChange={setViewSectionId}
                />
                <DrumEditor
                    song={song}
                    beatsPerMeasure={meta.beats_per_measure}
                    pattern={pattern}
                    sections={sections}
                    playingMeasure={currentMeasure}
                    followEnabled={followTarget === 'drum'}
                    onChange={setPattern}
                    onPreview={triggerPreview}
                    onPlayMeasure={playMeasure}
                    viewSectionId={viewSectionId}
                    onViewSectionChange={setViewSectionId}
                />
            </div>
        </div>
    );
}
