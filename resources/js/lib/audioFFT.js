// 動画ビジュアライザー用の軽量オーディオ解析。
// OfflineAudioContext の AnalyserNode はフレーム単位で扱いにくいため、
// レンダリング済み AudioBuffer の PCM から自前 FFT で各フレームの周波数・音量を求める。

// 反復基数2 Cooley-Tukey FFT。re/im は長さ2^kの実部・虚部（in-place で破壊更新）。
function fftInPlace(re, im) {
    const n = re.length;
    // ビット反転並べ替え
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wRe = Math.cos(ang);
        const wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let curRe = 1;
            let curIm = 0;
            for (let k = 0; k < len / 2; k++) {
                const aRe = re[i + k];
                const aIm = im[i + k];
                const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
                const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
                re[i + k] = aRe + bRe;
                im[i + k] = aIm + bIm;
                re[i + k + len / 2] = aRe - bRe;
                im[i + k + len / 2] = aIm - bIm;
                const nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
}

// AudioBuffer を 1ch モノラルに混合した Float32Array を返す。
export function toMono(buffer) {
    const n = buffer.length;
    const ch = buffer.numberOfChannels;
    const mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < n; i++) mono[i] += data[i];
    }
    if (ch > 1) for (let i = 0; i < n; i++) mono[i] /= ch;
    return mono;
}

// 解析の下準備（窓・ビン境界・出力配列・1フレーム計算関数）をまとめて返す。
// sync / async 両方のドライバから使う。
function buildAnalyzer(buffer, { fps = 30, fftSize = 2048, bars = 64 } = {}) {
    const sampleRate = buffer.sampleRate;
    const mono = toMono(buffer);
    const frameCount = Math.ceil(buffer.duration * fps) + 1;

    const win = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));

    const half = fftSize / 2;
    const minBin = 1;
    const maxBin = half - 1;
    const edges = new Array(bars + 1);
    for (let b = 0; b <= bars; b++) edges[b] = Math.round(minBin * Math.pow(maxBin / minBin, b / bars));

    const barsOut = [];
    const rmsOut = new Float32Array(frameCount);
    const bassOut = new Float32Array(frameCount);
    const midOut = new Float32Array(frameCount);
    const trebleOut = new Float32Array(frameCount);

    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const mag = new Float32Array(half);

    const bandEnergy = (loHz, hiHz) => {
        const loB = Math.max(1, Math.floor((loHz * fftSize) / sampleRate));
        const hiB = Math.min(half - 1, Math.ceil((hiHz * fftSize) / sampleRate));
        let acc = 0;
        for (let i = loB; i <= hiB; i++) acc += mag[i];
        return acc / Math.max(1, hiB - loB);
    };

    const computeFrame = (f) => {
        const center = Math.floor((f / fps) * sampleRate);
        const start = center - half;
        let sumSq = 0;
        for (let i = 0; i < fftSize; i++) {
            const idx = start + i;
            const s = idx >= 0 && idx < mono.length ? mono[idx] : 0;
            re[i] = s * win[i];
            im[i] = 0;
            sumSq += s * s;
        }
        fftInPlace(re, im);
        for (let i = 0; i < half; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / half;

        const arr = new Float32Array(bars);
        for (let b = 0; b < bars; b++) {
            const lo = edges[b];
            const hi = Math.max(edges[b + 1], lo + 1);
            let acc = 0;
            for (let i = lo; i < hi; i++) acc += mag[i];
            const avg = acc / (hi - lo);
            arr[b] = Math.min(1, Math.log10(1 + avg * 250) / Math.log10(251));
        }
        barsOut[f] = arr;
        rmsOut[f] = Math.min(1, Math.sqrt(sumSq / fftSize) * 3);
        bassOut[f] = Math.min(1, bandEnergy(20, 200) * 200);
        midOut[f] = Math.min(1, bandEnergy(200, 2000) * 200);
        trebleOut[f] = Math.min(1, bandEnergy(2000, 12000) * 300);
    };

    const result = { bars: barsOut, rms: rmsOut, bass: bassOut, mid: midOut, treble: trebleOut, frameCount, fps };
    return { frameCount, computeFrame, result };
}

// 各動画フレームの特徴量を同期計算する（明示的な書き出しクリック時用）。
export function analyzeForVideo(buffer, opts = {}) {
    const { frameCount, computeFrame, result } = buildAnalyzer(buffer, opts);
    for (let f = 0; f < frameCount; f++) computeFrame(f);
    return result;
}

// 非同期版: 一定フレームごとに制御を返し UI を固めない（バックグラウンド事前計算用）。
// onProgress(0..1)、shouldCancel() が true を返したら中断（null を返す）。
export async function analyzeForVideoAsync(buffer, opts = {}, { chunk = 120, onProgress = null, shouldCancel = null } = {}) {
    const { frameCount, computeFrame, result } = buildAnalyzer(buffer, opts);
    for (let f = 0; f < frameCount; f++) {
        computeFrame(f);
        if (f % chunk === 0) {
            if (shouldCancel?.()) return null;
            onProgress?.(f / frameCount);
            await new Promise((r) => setTimeout(r, 0));
        }
    }
    onProgress?.(1);
    return result;
}
