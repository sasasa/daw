import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderMix, audioBufferToWav } from '../lib/exportAudio';
import { exportVideo } from '../lib/exportVideo';
import api from '../lib/api';

// ビジュアライザーの実装バージョン。描画を変えたら上げると動画キャッシュが無効になる。
const VIZ_VERSION = 'v2'; // v2: 歌詞オーバーレイ追加

// ミックスパラメータの署名（SHA-256 hex）。サーバーキャッシュの一致判定に使う。
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// WAV(URL) を取得して AudioBuffer にデコードする。
async function fetchDecode(url) {
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        return await ctx.decodeAudioData(ab);
    } finally {
        ctx.close();
    }
}

// 書き出し用のミックス AudioBuffer と動画(MP4/WebM)を、編集が落ち着いたら
// バックグラウンドで用意してサーバーに保存しておく。書き出しクリック時はダウンロードだけで済む。
//
// 返り値:
//  - status: 音声準備の状態 'idle'|'checking'|'preparing'|'ready'|'error'
//  - videoStatus: 動画準備の状態（同上）
//  - getBuffer(): 現在の署名に対応する AudioBuffer（必要なら遅延デコード）。無ければ null。
//  - getVideo(): 現在の署名に対応するキャッシュ動画 { url, format }。無ければ null。
export function useExportPrep(songId, params, { lyrics = {}, debounceMs = 8000, videoDebounceMs = 4000 } = {}) {
    const lyricsSig = useMemo(() => JSON.stringify(lyrics ?? {}), [lyrics]);
    const lyricsRef = useRef(lyrics);
    lyricsRef.current = lyrics;
    const sig = useMemo(() => JSON.stringify(params), [params]);
    const sigRef = useRef(sig);
    sigRef.current = sig;

    // 音声キャッシュ
    const cacheRef = useRef({ sig: null, buffer: null, url: null });
    const runIdRef = useRef(0);
    const timerRef = useRef(null);
    const [status, setStatus] = useState('idle');

    // 動画キャッシュ
    const videoCacheRef = useRef({ sig: null, url: null, format: null }); // sig は videoSig(=sha256(sig+VIZ_VERSION))
    const videoRunIdRef = useRef(0);
    const videoTimerRef = useRef(null);
    const [videoStatus, setVideoStatus] = useState('idle');

    // 音声 AudioBuffer を用意（メモリにあればそれを、無ければキャッシュURLからデコード）。
    const ensureBuffer = useCallback(async () => {
        const c = cacheRef.current;
        if (c.sig !== sigRef.current) return null;
        if (c.buffer) return c.buffer;
        if (c.url) {
            try {
                const buf = await fetchDecode(c.url);
                if (cacheRef.current.sig === sigRef.current) cacheRef.current.buffer = buf;
                return buf;
            } catch (e) {
                console.debug('export-cache decode failed', e?.message ?? e);
                return null;
            }
        }
        return null;
    }, []);

    // --- 音声の準備 ---
    useEffect(() => {
        if (cacheRef.current.sig === sig && (cacheRef.current.buffer || cacheRef.current.url)) {
            setStatus('ready');
            return;
        }
        const myId = ++runIdRef.current;
        const cancelled = () => runIdRef.current !== myId;

        (async () => {
            setStatus('checking');
            let hash;
            try {
                hash = await sha256(sig);
            } catch (_) {
                hash = null;
            }
            if (cancelled()) return;

            if (hash) {
                try {
                    const res = await api.get(route('songs.export-cache', songId));
                    if (cancelled()) return;
                    if (res.data?.signature === hash && res.data.url) {
                        cacheRef.current = { sig, buffer: null, url: res.data.url };
                        setStatus('ready');
                        return;
                    }
                } catch (e) {
                    console.debug('export-cache fetch failed', e?.message ?? e);
                }
            }
            if (cancelled()) return;

            setStatus('idle');
            timerRef.current = setTimeout(async () => {
                if (cancelled()) return;
                setStatus('preparing');
                try {
                    const buffer = await renderMix(params);
                    if (cancelled()) return;
                    cacheRef.current = { sig, buffer, url: null };
                    setStatus('ready');
                    if (hash) {
                        try {
                            const blob = audioBufferToWav(buffer);
                            const fd = new FormData();
                            fd.append('signature', hash);
                            fd.append('audio', blob, 'mix.wav');
                            const up = await api.post(route('songs.export-cache.store', songId), fd);
                            if (!cancelled() && cacheRef.current.sig === sig && up.data?.url) {
                                cacheRef.current.url = up.data.url;
                            }
                        } catch (e) {
                            console.debug('export-cache upload failed', e?.message ?? e);
                        }
                    }
                } catch (e) {
                    console.debug('export prepare skipped/failed', e?.message ?? e);
                    if (!cancelled()) setStatus('error');
                }
            }, debounceMs);
        })();

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [sig, songId, debounceMs]);

    // --- 動画の準備（音声準備が ready になってから、バックグラウンドでエンコード＆保存） ---
    useEffect(() => {
        if (status !== 'ready') return;
        const myId = ++videoRunIdRef.current;
        const cancelled = () => videoRunIdRef.current !== myId;

        (async () => {
            let vsig;
            try {
                vsig = await sha256(sig + '|' + lyricsSig + '|' + VIZ_VERSION);
            } catch (_) {
                return;
            }
            if (cancelled()) return;

            if (videoCacheRef.current.sig === vsig && videoCacheRef.current.url) {
                setVideoStatus('ready');
                return;
            }

            setVideoStatus('checking');
            try {
                const res = await api.get(route('songs.export-cache', songId));
                if (cancelled()) return;
                const v = res.data?.video;
                if (v?.signature === vsig && v.url) {
                    videoCacheRef.current = { sig: vsig, url: v.url, format: v.format || 'mp4' };
                    setVideoStatus('ready');
                    return;
                }
            } catch (e) {
                console.debug('video-cache fetch failed', e?.message ?? e);
            }
            if (cancelled()) return;

            setVideoStatus('idle');
            videoTimerRef.current = setTimeout(async () => {
                if (cancelled()) return;
                setVideoStatus('preparing');
                try {
                    const buffer = await ensureBuffer();
                    if (cancelled() || !buffer) {
                        if (!cancelled()) setVideoStatus('idle');
                        return;
                    }
                    const { blob, format } = await exportVideo(params, { buffer, lyrics: lyricsRef.current, download: false });
                    if (cancelled()) return;
                    const fd = new FormData();
                    fd.append('signature', vsig);
                    fd.append('video', blob, `mix.${format}`);
                    const up = await api.post(route('songs.export-cache.video.store', songId), fd);
                    if (!cancelled() && up.data?.url) {
                        videoCacheRef.current = { sig: vsig, url: up.data.url, format: up.data.format || format };
                    }
                    if (!cancelled()) setVideoStatus('ready');
                } catch (e) {
                    console.debug('video prepare skipped/failed', e?.message ?? e);
                    if (!cancelled()) setVideoStatus('error');
                }
            }, videoDebounceMs);
        })();

        return () => {
            if (videoTimerRef.current) {
                clearTimeout(videoTimerRef.current);
                videoTimerRef.current = null;
            }
        };
    }, [status, sig, lyricsSig, songId, videoDebounceMs, ensureBuffer]);

    const getBuffer = useCallback(() => ensureBuffer(), [ensureBuffer]);

    const getVideo = useCallback(async () => {
        let vsig;
        try {
            vsig = await sha256(sigRef.current + '|' + JSON.stringify(lyricsRef.current ?? {}) + '|' + VIZ_VERSION);
        } catch (_) {
            return null;
        }
        const c = videoCacheRef.current;
        return c.sig === vsig && c.url ? { url: c.url, format: c.format } : null;
    }, []);

    return { status, videoStatus, getBuffer, getVideo };
}
