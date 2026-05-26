// 音楽に同期した幾何学ビジュアライザー動画を生成して MP4 で書き出す。
// 速度優先: 実時間録画(MediaRecorder)ではなく WebCodecs でフレームを実時間より速くエンコードし、
// mp4-muxer で音声(AAC)と多重化して MP4 を直接生成する。
// WebCodecs 非対応ブラウザでは MediaRecorder の実時間録画(WebM)にフォールバックする。
import * as Tone from 'tone';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { renderMix, downloadBlob } from './exportAudio';
import { analyzeForVideo } from './audioFFT';
import { drawFrame, featAt } from './visualizer';
import { measureDurationSeconds, measureBpm } from './sections';

// 各動画フレームに表示する歌詞を、小節のタイミング（セクション別BPM/拍子）から割り出す。
function buildLyricByFrame({ drumPattern = [], bpm = 120, beatsPerMeasure = 4, sections = [], lyrics = {}, frameCount, fps }) {
    const bounds = [0];
    const measureNums = [];
    drumPattern.forEach((m) => {
        const unit = m.unit || 4;
        const beats = m.beats || beatsPerMeasure || 4;
        measureNums.push(m.measure);
        bounds.push(bounds[bounds.length - 1] + measureDurationSeconds(beats, unit, measureBpm(sections, bpm, m.measure)));
    });
    const out = new Array(frameCount).fill('');
    const hasLyrics = lyrics && Object.keys(lyrics).length > 0;
    if (!hasLyrics) return out;
    for (let f = 0; f < frameCount; f++) {
        const t = f / fps;
        for (let i = 0; i < bounds.length - 1; i++) {
            if (t >= bounds[i] && t < bounds[i + 1]) {
                out[f] = lyrics[measureNums[i]] ?? '';
                break;
            }
        }
    }
    return out;
}

export function webCodecsSupported() {
    return typeof window !== 'undefined' && 'VideoEncoder' in window && 'AudioEncoder' in window && 'AudioData' in window;
}

// AudioBuffer を AAC でエンコードして muxer に追加する。
async function encodeAudio(muxer, buffer) {
    const sampleRate = buffer.sampleRate;
    const numberOfChannels = Math.min(2, buffer.numberOfChannels);

    const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error', e),
    });
    audioEncoder.configure({
        codec: 'mp4a.40.2', // AAC-LC
        sampleRate,
        numberOfChannels,
        bitrate: 192000,
    });

    // 1024 フレームずつ planar(f32) で投入。
    const chunkFrames = 1024;
    const total = buffer.length;
    const chans = [];
    for (let c = 0; c < numberOfChannels; c++) chans.push(buffer.getChannelData(c));

    for (let pos = 0; pos < total; pos += chunkFrames) {
        const frames = Math.min(chunkFrames, total - pos);
        const planar = new Float32Array(frames * numberOfChannels);
        for (let c = 0; c < numberOfChannels; c++) {
            planar.set(chans[c].subarray(pos, pos + frames), c * frames);
        }
        const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: frames,
            numberOfChannels,
            timestamp: Math.round((pos / sampleRate) * 1e6),
            data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
}

// WebCodecs パス: フレーム描画 → H.264 エンコード → mux → MP4 Blob。
async function renderMp4WebCodecs(buffer, analysis, { width, height, fps, onProgress, lyricByFrame = [] }) {
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width, height },
        audio: { codec: 'aac', numberOfChannels: Math.min(2, buffer.numberOfChannels), sampleRate: buffer.sampleRate },
        fastStart: 'in-memory',
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error', e),
    });
    videoEncoder.configure({
        codec: 'avc1.4d0028', // H.264 Main@L4
        width,
        height,
        bitrate: 2_500_000, // サーバー保存(アップロード上限)を考慮しつつ視認性を確保
        framerate: fps,
    });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const frameCount = analysis.frameCount;
    const usPerFrame = 1e6 / fps;

    for (let f = 0; f < frameCount; f++) {
        drawFrame(ctx, width, height, featAt(analysis, f), f, fps, lyricByFrame[f] || '');
        const frame = new VideoFrame(canvas, { timestamp: Math.round(f * usPerFrame), duration: Math.round(usPerFrame) });
        videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();

        // バックプレッシャ: キューが溜まりすぎたら処理を待つ。
        if (videoEncoder.encodeQueueSize > 8) {
            await new Promise((r) => setTimeout(r, 0));
        }
        if (f % 5 === 0) {
            onProgress?.(f / frameCount);
            await new Promise((r) => setTimeout(r, 0)); // UI 更新
        }
    }
    await videoEncoder.flush();
    videoEncoder.close();

    await encodeAudio(muxer, buffer);

    muxer.finalize();
    onProgress?.(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// フォールバック: MediaRecorder で実時間録画（WebM）。canvas を fps で captureStream。
async function renderWebmRealtime(buffer, analysis, { width, height, fps, onProgress, lyricByFrame = [] }) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 音声: AudioContext で buffer を再生し、MediaStreamDestination から取り込む。
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(dest);
    src.connect(audioCtx.destination);

    const videoStream = canvas.captureStream(fps);
    const stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const done = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start(100);

    const startTime = audioCtx.currentTime + 0.05;
    src.start(startTime);

    const duration = buffer.duration;
    await new Promise((resolve) => {
        const tick = () => {
            const t = audioCtx.currentTime - startTime;
            if (t >= duration) {
                resolve();
                return;
            }
            const f = Math.floor(t * fps);
            drawFrame(ctx, width, height, featAt(analysis, f), f, fps, lyricByFrame[f] || '');
            onProgress?.(Math.min(0.99, t / duration));
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });

    recorder.stop();
    src.stop();
    await done;
    audioCtx.close();
    onProgress?.(1);
    return new Blob(chunks, { type: 'video/webm' });
}

function safeName(name) {
    return (name || 'song').replace(/[\\/:*?"<>|]/g, '_').trim() || 'song';
}

// 高レベル API: ミックス → 解析 → 動画生成 → ダウンロード。
// onStage(stage, progress): stage='render'|'analyze'|'video'|'audio', progress は 0..1 か null。
// 返り値: { format: 'mp4'|'webm', blob }
export async function exportVideo(params, { filename = 'song', width = 1280, height = 720, fps = 30, onStage = null, buffer = null, analysis = null, lyrics = {}, download = true } = {}) {
    if (!buffer) {
        onStage?.('render', null);
        buffer = await renderMix(params);
    }
    if (!analysis) {
        onStage?.('analyze', null);
        analysis = analyzeForVideo(buffer, { fps });
    }

    const lyricByFrame = buildLyricByFrame({
        drumPattern: params.drumPattern,
        bpm: params.bpm,
        beatsPerMeasure: params.beatsPerMeasure,
        sections: params.sections,
        lyrics,
        frameCount: analysis.frameCount,
        fps,
    });

    const base = safeName(filename);
    let format;
    let blob;
    if (webCodecsSupported()) {
        format = 'mp4';
        blob = await renderMp4WebCodecs(buffer, analysis, { width, height, fps, onProgress: (p) => onStage?.('video', p), lyricByFrame });
    } else {
        // フォールバック（実時間録画・WebM）
        format = 'webm';
        blob = await renderWebmRealtime(buffer, analysis, { width, height, fps, onProgress: (p) => onStage?.('video', p), lyricByFrame });
    }
    if (download) downloadBlob(blob, `${base}.${format}`);
    return { format, blob };
}
