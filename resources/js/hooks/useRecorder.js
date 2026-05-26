import { useCallback, useRef, useState } from 'react';

// 対応する録音 MIME を選ぶ（Chrome: webm/opus, Safari: mp4）。
function pickMimeType() {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
    ];
    for (const t of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return '';
}

// MediaRecorder を薄くラップし、録音 Blob と経過時間を返す。
export function useRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const startedAtRef = useRef(0);
    const timerRef = useRef(null);
    const resolveRef = useRef(null);

    // 入力ストリームと MediaRecorder を準備する（まだ録音は開始しない）。
    // deviceId を指定すると、その入力チャンネル（オーディオIFの入力など）を使う。
    const prepare = useCallback(async (deviceId) => {
        // 楽器録音では通話用 DSP（エコーキャンセル/ノイズ抑制/自動ゲイン）を必ずオフにする。
        // これらが有効だと音が歪む・音量が波打つなど「変な音」になる。
        const audio = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        };
        if (deviceId) audio.deviceId = { exact: deviceId };
        const stream = await navigator.mediaDevices.getUserMedia({ audio });
        streamRef.current = stream;
        const mimeType = pickMimeType();
        // ビットレートを上げて録音品質を確保。
        const options = mimeType ? { mimeType, audioBitsPerSecond: 256000 } : undefined;
        const recorder = new MediaRecorder(stream, options);
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
            const type = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunksRef.current, { type });
            const durationMs = Date.now() - startedAtRef.current;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            if (resolveRef.current) {
                resolveRef.current({ blob, durationMs, mimeType: type });
                resolveRef.current = null;
            }
        };
        recorderRef.current = recorder;
    }, []);

    // 準備済みの recorder で録音を開始する（カウントイン後に呼ぶ）。
    const begin = useCallback(() => {
        if (!recorderRef.current) return;
        startedAtRef.current = Date.now();
        recorderRef.current.start();
        setIsRecording(true);
        setElapsedMs(0);
        timerRef.current = setInterval(() => {
            setElapsedMs(Date.now() - startedAtRef.current);
        }, 200);
    }, []);

    // 準備〜開始を一度に行う（カウントイン不要なとき用）。
    const start = useCallback(
        async (deviceId) => {
            await prepare(deviceId);
            begin();
        },
        [prepare, begin]
    );

    // 停止して { blob, durationMs, mimeType } を解決する Promise を返す。
    const stop = useCallback(() => {
        return new Promise((resolve) => {
            if (!recorderRef.current || recorderRef.current.state === 'inactive') {
                resolve(null);
                return;
            }
            resolveRef.current = resolve;
            clearInterval(timerRef.current);
            setIsRecording(false);
            recorderRef.current.stop();
        });
    }, []);

    return { isRecording, elapsedMs, prepare, begin, start, stop };
}
