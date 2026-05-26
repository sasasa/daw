// 曲全体（ドラム＋録音トラック）をオフラインでミックスし、音楽ファイルとして書き出すユーティリティ。
// useAudioEngine の play と同じタイミング計算を使い、Tone.Offline で実時間に依存せずレンダリングする。
import * as Tone from 'tone';
import { Mp3Encoder } from '@breezystack/lamejs';
import { measureDurationSeconds, measureBpm, measureSwing, swingPos } from './sections';

// ドラムパターン → { time(秒), drumKey } のイベント列。play() のロジックと一致させる。
function buildDrumEvents({ drumPattern, bpm, beatsPerMeasure, sections, swing, swingRatio }) {
    const bpmOf = (measureNumber) => measureBpm(sections, bpm, measureNumber);
    const events = [];
    let tSec = 0;
    drumPattern.forEach((m) => {
        const unit = m.unit || 4;
        const beats = m.beats || beatsPerMeasure || 4;
        const bpmM = bpmOf(m.measure);
        const sixteenthSec = 60 / bpmM / 4;
        const quarterSec = 60 / bpmM;
        const spb = 16 / unit;
        const sw = measureSwing(sections, swing, m.measure);
        (m.notes || []).forEach((n) => {
            const si = (n.beat - 1) * spb + n.subdivision;
            let t = si * sixteenthSec;
            if (sw !== '0') {
                const q = Math.floor(t / quarterSec);
                const local = (t - q * quarterSec) / quarterSec;
                t = (q + swingPos(local, sw, swingRatio / 100)) * quarterSec;
            }
            events.push({ time: tSec + t, drumKey: n.drumKey });
        });
        tSec += beats * spb * sixteenthSec;
    });
    return events;
}

// 各小節の長さを積算したドラムパート総尺（秒）。
function drumTotalSeconds({ drumPattern, bpm, beatsPerMeasure, sections }) {
    const bpmOf = (measureNumber) => measureBpm(sections, bpm, measureNumber);
    let total = 0;
    drumPattern.forEach((m) => {
        const unit = m.unit || 4;
        const beats = m.beats || beatsPerMeasure || 4;
        total += measureDurationSeconds(beats, unit, bpmOf(m.measure));
    });
    return total;
}

// createDrumKit（useAudioEngine）と同じ音色を Offline コンテキスト内で生成する。
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
    return (drumKey, time) => {
        switch (drumKey) {
            case 'BD': bd.triggerAttackRelease('C1', '8n', time); break;
            case 'HT': ht.triggerAttackRelease('G2', '8n', time); break;
            case 'FT': ft.triggerAttackRelease('C2', '8n', time); break;
            case 'SN': sn.triggerAttackRelease('16n', time); break;
            case 'HH': hh.triggerAttackRelease('C5', '32n', time); break;
            case 'CY': cy.triggerAttackRelease('C5', '1n', time); break;
            default: break;
        }
    };
}

// 曲全体を AudioBuffer にミックスして返す。
export async function renderMix({
    audioTracks = [],
    drumPattern = [],
    bpm = 120,
    beatsPerMeasure = 4,
    sections = [],
    swing = '0',
    swingRatio = 66,
    sampleRate = 44100,
    tailSeconds = 2, // シンバル等の余韻ぶんの末尾余白
}) {
    // 録音トラックを Tone の（メイン）コンテキストでデコードしておく。
    // Tone.Offline は実行中だけグローバルコンテキストを差し替えるため、ここで先にデコードし、
    // Tone.ToneAudioBuffer / Tone.Player 経由で扱うことでコンテキスト不整合を避ける。
    await Tone.getContext().resume?.();
    const decoded = [];
    await Promise.all(
        audioTracks.map(async (track) => {
            try {
                const buffer = await Tone.ToneAudioBuffer.fromUrl(track.url);
                decoded.push({ buffer, offset: (track.offset_ms || 0) / 1000 });
            } catch (e) {
                console.error('export: audio decode failed', track, e);
            }
        })
    );

    const drumTotal = drumTotalSeconds({ drumPattern, bpm, beatsPerMeasure, sections });
    const audioEnd = decoded.reduce((mx, d) => Math.max(mx, d.offset + d.buffer.duration), 0);
    const duration = Math.max(drumTotal, audioEnd) + tailSeconds;
    if (duration <= tailSeconds) {
        throw new Error('書き出す音がありません。');
    }

    const events = buildDrumEvents({ drumPattern, bpm, beatsPerMeasure, sections, swing, swingRatio });

    const rendered = await Tone.Offline(
        ({ transport }) => {
            transport.bpm.value = bpm;
            const trigger = createDrumKit();
            const part = new Tone.Part((time, ev) => trigger(ev.drumKey, time), events);
            part.start(0);

            // 録音トラックは Tone.Player でコンテキスト時刻 offset に配置する（transport 非依存）。
            decoded.forEach((d) => {
                const player = new Tone.Player(d.buffer).toDestination();
                player.start(d.offset);
            });

            transport.start(0);
        },
        duration,
        2,
        sampleRate
    );

    // Tone.Offline は ToneAudioBuffer を返す。生の AudioBuffer を取り出す。
    return rendered.get ? rendered.get() : rendered;
}

// AudioBuffer → WAV(16bit PCM) の Blob。
export function audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const ab = new ArrayBuffer(44 + dataSize);
    const view = new DataView(ab);

    const writeStr = (off, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let c = 0; c < numCh; c++) {
            let s = Math.max(-1, Math.min(1, channels[c][i]));
            s = s < 0 ? s * 0x8000 : s * 0x7fff;
            view.setInt16(off, s, true);
            off += 2;
        }
    }
    return new Blob([ab], { type: 'audio/wav' });
}

// AudioBuffer → MP3(128kbps) の Blob。lamejs で各チャンネルを 16bit に量子化して符号化。
// エンコードは同期的に重いため、一定ブロックごとに await で制御を返し UI（ローディング）を更新させる。
// onProgress(0..1) は符号化の進捗。
export async function audioBufferToMp3(buffer, kbps = 128, onProgress = null) {
    const numCh = Math.min(2, buffer.numberOfChannels);
    const sampleRate = buffer.sampleRate;
    const encoder = new Mp3Encoder(numCh, sampleRate, kbps);

    const toInt16 = (f32) => {
        const out = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
            const s = Math.max(-1, Math.min(1, f32[i]));
            out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return out;
    };

    const left = toInt16(buffer.getChannelData(0));
    const right = numCh > 1 ? toInt16(buffer.getChannelData(1)) : left;

    const blockSize = 1152;
    const chunks = [];
    const yieldEvery = 200; // 200ブロック(≒5秒分)ごとに制御を返す
    let block = 0;
    for (let i = 0; i < left.length; i += blockSize) {
        const l = left.subarray(i, i + blockSize);
        const r = right.subarray(i, i + blockSize);
        const buf = numCh > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
        if (buf.length > 0) chunks.push(new Uint8Array(buf));
        block++;
        if (block % yieldEvery === 0) {
            onProgress?.(i / left.length);
            // マクロタスクへ制御を返してブラウザに再描画させる。
            await new Promise((r) => setTimeout(r, 0));
        }
    }
    const end = encoder.flush();
    if (end.length > 0) chunks.push(new Uint8Array(end));
    onProgress?.(1);

    return new Blob(chunks, { type: 'audio/mpeg' });
}

// 任意のファイル名でブラウザ保存をトリガする。
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 同一オリジンの URL からファイル名を指定してダウンロードする。
export function downloadUrl(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// ファイル名に使えない文字を除去。
function safeName(name) {
    return (name || 'song').replace(/[\\/:*?"<>|]/g, '_').trim() || 'song';
}

// 高レベル API: ミックス → 指定形式でエンコード → ダウンロード。
// onStage(stage, progress) は進捗通知: stage='render'|'encode', progress は 0..1（不明なら null）。
// buffer に事前レンダリング済み AudioBuffer を渡すと、ミックス工程を省略する。
export async function exportSong(params, { format = 'wav', filename = 'song', onStage = null, buffer = null } = {}) {
    if (!buffer) {
        onStage?.('render', null);
        buffer = await renderMix(params);
    }
    const base = safeName(filename);
    if (format === 'mp3') {
        onStage?.('encode', 0);
        const blob = await audioBufferToMp3(buffer, 128, (p) => onStage?.('encode', p));
        downloadBlob(blob, `${base}.mp3`);
    } else {
        onStage?.('encode', null);
        downloadBlob(audioBufferToWav(buffer), `${base}.wav`);
    }
}
