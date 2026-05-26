import { useCallback, useRef, useState } from 'react';
import * as Tone from 'tone';
import { measureDurationSeconds, measureBpm, measureSwing, swingPos } from '../lib/sections';

// ドラム音源を遅延生成して使い回すためのファクトリ。
// Tone.js の各 Synth を drumKey ごとに用意し、triggerPreview / play で共有する。
function createDrumKit() {
    const out = Tone.getDestination();

    const bd = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, volume: 2 }).connect(out);
    const ht = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 4 }).connect(out);
    const ft = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4 }).connect(out);
    const sn = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
        volume: -4,
    }).connect(out);
    const hh = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.06, release: 0.01 },
        harmonicity: 5.1,
        resonance: 4000,
        volume: -18,
    }).connect(out);
    const cy = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 1.2, release: 0.2 },
        harmonicity: 5.1,
        resonance: 3000,
        volume: -16,
    }).connect(out);

    return {
        trigger(drumKey, time) {
            switch (drumKey) {
                case 'BD': bd.triggerAttackRelease('C1', '8n', time); break;
                case 'HT': ht.triggerAttackRelease('G2', '8n', time); break;
                case 'FT': ft.triggerAttackRelease('C2', '8n', time); break;
                case 'SN': sn.triggerAttackRelease('16n', time); break;
                case 'HH': hh.triggerAttackRelease('C5', '32n', time); break;
                case 'CY': cy.triggerAttackRelease('C5', '1n', time); break;
                default: break;
            }
        },
        dispose() {
            [bd, ht, ft, sn, hh, cy].forEach((s) => s.dispose());
        },
    };
}

export function useAudioEngine() {
    const kitRef = useRef(null);
    const buffersRef = useRef([]); // 再生中の AudioBufferSourceNode
    const partRef = useRef(null);
    const rafRef = useRef(null); // 再生ヘッド追従の rAF
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // 一時停止中
    const [currentMeasure, setCurrentMeasure] = useState(null); // 再生中の小節(1始まり)
    const [currentSeconds, setCurrentSeconds] = useState(0); // 再生位置(秒)

    const lastArgsRef = useRef(null); // resume 用に直近の play 引数を保持
    const boundsRef = useRef(null); // 各小節境界（秒）。seek 時の小節算出に使う
    const pausedSecondsRef = useRef(0); // 一時停止/シーク位置（秒）
    const isPausedRef = useRef(false);

    // 出力レイテンシ（秒）。録音のタイミング補正の目安に使う。
    const getLatencySeconds = useCallback(() => {
        try {
            const ctx = Tone.getContext().rawContext;
            return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
        } catch (_) {
            return 0;
        }
    }, []);

    const ensureStarted = useCallback(async () => {
        await Tone.start();
        if (!kitRef.current) {
            kitRef.current = createDrumKit();
        }
        return kitRef.current;
    }, []);

    // 単発プレビュー（打ち込み時の確認音）
    const triggerPreview = useCallback(
        async (drumKey) => {
            const kit = await ensureStarted();
            kit.trigger(drumKey, Tone.now());
        },
        [ensureStarted]
    );

    // カウントイン。拍子(beats/unit)に応じた拍数・間隔で鳴らし、次の小節頭で解決する Promise を返す。
    // 1 つのシンセで全拍をスケジュールし、鳴り終わってから破棄する（各拍が確実に鳴る）。
    const metronomeCountIn = useCallback(
        async (bpm, beats = 4, unit = 4) => {
            await ensureStarted();
            const spb = (60 / bpm) * (4 / unit); // 1拍の長さ（x/4=4分, x/8=8分）
            const lead = 0.15;
            const synth = new Tone.MembraneSynth({
                pitchDecay: 0.008,
                octaves: 2,
                envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
                volume: 0,
            }).connect(Tone.getDestination());

            const start = Tone.now() + lead;
            for (let i = 0; i < beats; i++) {
                // 1拍目はアクセント（高め）。
                synth.triggerAttackRelease(i === 0 ? 'C5' : 'G4', '16n', start + i * spb);
            }

            const downbeatMs = (lead + beats * spb) * 1000;
            setTimeout(() => synth.dispose(), downbeatMs + 500);
            return new Promise((resolve) => setTimeout(resolve, downbeatMs));
        },
        [ensureStarted]
    );

    // 再生中の音源・スケジュールを破棄する。keepPosition=true なら再生位置表示を残す（一時停止用）。
    const teardown = useCallback((keepPosition) => {
        const transport = Tone.getTransport();
        transport.stop();
        transport.cancel();
        if (partRef.current) {
            partRef.current.dispose();
            partRef.current = null;
        }
        buffersRef.current.forEach((src) => {
            try { src.stop(); } catch (_) { /* 既に停止済み */ }
        });
        buffersRef.current = [];
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!keepPosition) {
            setCurrentMeasure(null);
            setCurrentSeconds(0);
        }
        setIsPlaying(false);
    }, []);

    const stop = useCallback(() => {
        teardown(false);
        isPausedRef.current = false;
        setIsPaused(false);
        pausedSecondsRef.current = 0;
    }, [teardown]);

    // 一時停止: 音を止め、現在位置を保持する（resume で続きから再生）。
    const pause = useCallback(() => {
        const transport = Tone.getTransport();
        if (transport.state !== 'started') return;
        const pos = transport.seconds;
        pausedSecondsRef.current = pos;
        teardown(true);
        setCurrentSeconds(pos);
        isPausedRef.current = true;
        setIsPaused(true);
    }, [teardown]);

    // ドラムパターンと録音音声を同期再生する。
    const play = useCallback(
        async ({
            audioTracks = [],
            drumPattern = [],
            bpm = 120,
            beatsPerMeasure = 4,
            sections = [],
            swing = '0',
            swingRatio = 66,
            metronome = false,
            startSeconds = 0,
            stopSeconds = null,
            onStart = null,
        }) => {
            const kit = await ensureStarted();
            const transport = Tone.getTransport();
            stop();
            transport.bpm.value = bpm;

            // resume 用に引数を保持（startSeconds/onStart は除く）。
            lastArgsRef.current = {
                audioTracks, drumPattern, bpm, beatsPerMeasure, sections, swing, swingRatio, stopSeconds,
            };
            isPausedRef.current = false;
            setIsPaused(false);

            // 各小節の BPM（セクション別）を取得。
            const bpmOf = (measureNumber) => measureBpm(sections, bpm, measureNumber);

            // ドラム: 小節ごとに拍子・BPM が異なるため、秒数を積算して各音符の時刻を求める。
            const events = [];
            let tSec = 0;
            drumPattern.forEach((m) => {
                const unit = m.unit || 4;
                const beats = m.beats || beatsPerMeasure || 4;
                const bpmM = bpmOf(m.measure);
                const sixteenthSec = 60 / bpmM / 4;
                const quarterSec = 60 / bpmM;
                const spb = 16 / unit;
                const sw = measureSwing(sections, swing, m.measure); // 小節のスウィング種別
                (m.notes || []).forEach((n) => {
                    const si = (n.beat - 1) * spb + n.subdivision;
                    let t = si * sixteenthSec; // 小節頭からの直線時間
                    if (sw !== '0') {
                        // 4分拍内でスウィング変換
                        const q = Math.floor(t / quarterSec);
                        const local = (t - q * quarterSec) / quarterSec;
                        t = (q + swingPos(local, sw, swingRatio / 100)) * quarterSec;
                    }
                    events.push({ time: tSec + t, drumKey: n.drumKey });
                });
                tSec += beats * spb * sixteenthSec;
            });
            const part = new Tone.Part((time, ev) => {
                kit.trigger(ev.drumKey, time);
            }, events);
            part.start(0);
            partRef.current = part;

            // 録音音声: fetch → decode → BufferSource を offset に合わせて schedule
            const ctx = Tone.getContext().rawContext;
            await Promise.all(
                audioTracks.map(async (track) => {
                    try {
                        const res = await fetch(track.url);
                        const arrayBuf = await res.arrayBuffer();
                        const audioBuf = await ctx.decodeAudioData(arrayBuf);
                        const off = (track.offset_ms || 0) / 1000;
                        // 開始位置より前から始まるトラックは、途中から（残りを）鳴らす。
                        let when = off;
                        let bufOffset = 0;
                        if (off < startSeconds) {
                            bufOffset = startSeconds - off;
                            when = startSeconds;
                        }
                        if (bufOffset >= audioBuf.duration) return; // 開始前に鳴り終わるものはスキップ
                        const src = ctx.createBufferSource();
                        src.buffer = audioBuf;
                        src.connect(ctx.destination);
                        buffersRef.current.push(src);
                        transport.schedule((t) => src.start(t, bufOffset), when);
                    } catch (e) {
                        console.error('audio decode failed', track, e);
                    }
                })
            );

            // 各小節の開始秒数（境界）を求め、再生ヘッドの小節を追従させる。
            const bounds = [0];
            drumPattern.forEach((m) => {
                const unit = m.unit || 4;
                const beats = m.beats || beatsPerMeasure || 4;
                bounds.push(bounds[bounds.length - 1] + measureDurationSeconds(beats, unit, bpmOf(m.measure)));
            });
            const total = bounds[bounds.length - 1];
            // 録音トラックの終端（offset+長さ）。最後の小節で切らず録音が鳴り終わるまで再生する。
            const audioEnd = audioTracks.reduce(
                (mx, t) => Math.max(mx, ((t.offset_ms || 0) + (t.duration_ms || 0)) / 1000),
                0
            );
            const endAt = stopSeconds != null ? stopSeconds : Math.max(total, audioEnd);
            boundsRef.current = bounds;

            // メトロノームON: 開始位置の小節の拍子・BPMでカウントインを鳴らしてから再生開始。
            if (metronome) {
                let mi = 0;
                for (let i = 0; i < bounds.length - 1; i++) {
                    if (startSeconds >= bounds[i] && startSeconds < bounds[i + 1]) {
                        mi = i;
                        break;
                    }
                }
                const m0 = drumPattern[mi] || {};
                await metronomeCountIn(bpmOf(m0.measure ?? 1), m0.beats || beatsPerMeasure || 4, m0.unit || 4);
            }

            // startSeconds から再生（その位置より前のイベントはスキップされる）。
            transport.start(undefined, Math.max(0, startSeconds));
            setIsPlaying(true);
            onStart?.(); // カウントイン後・再生開始ちょうど（録音開始の同期点）

            const tick = () => {
                const t = transport.seconds;
                if (t >= endAt) {
                    stop();
                    return;
                }
                setCurrentSeconds(t);
                // ドラム終端より後（録音のみ鳴っている区間）は最後の小節を維持する。
                let m = bounds.length - 1;
                for (let i = 0; i < bounds.length - 1; i++) {
                    if (t >= bounds[i] && t < bounds[i + 1]) {
                        m = i + 1;
                        break;
                    }
                }
                setCurrentMeasure(m);
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        },
        [ensureStarted, stop, metronomeCountIn]
    );

    // 一時停止位置（またはシーク位置）から続きを再生する。カウントインなし。
    const resume = useCallback(() => {
        if (!isPausedRef.current) return;
        const args = lastArgsRef.current;
        if (!args) return;
        const startSeconds = pausedSecondsRef.current;
        play({ ...args, startSeconds, metronome: false });
    }, [play]);

    // 再生位置を秒で設定する（主に一時停止中のシーク）。表示も更新する。
    const seek = useCallback((seconds) => {
        const s = Math.max(0, seconds);
        pausedSecondsRef.current = s;
        setCurrentSeconds(s);
        const bounds = boundsRef.current;
        if (bounds) {
            let m = 1;
            for (let i = 0; i < bounds.length - 1; i++) {
                if (s >= bounds[i] && s < bounds[i + 1]) {
                    m = i + 1;
                    break;
                }
            }
            setCurrentMeasure(m);
        }
    }, []);

    return {
        ensureStarted,
        triggerPreview,
        play,
        stop,
        pause,
        resume,
        seek,
        isPlaying,
        isPaused,
        currentMeasure,
        currentSeconds,
        metronomeCountIn,
        getLatencySeconds,
    };
}
