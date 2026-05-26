import React, { useEffect, useRef } from 'react';

// 録音音声を fetch → decodeAudioData → Canvas にピーク波形を描画する。
export default function Waveform({ url, width = 600, height = 56 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const draw = async () => {
            try {
                const res = await fetch(url);
                const arrayBuf = await res.arrayBuffer();
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtx();
                const audioBuf = await ctx.decodeAudioData(arrayBuf);
                ctx.close();
                if (cancelled) return;

                const canvas = canvasRef.current;
                if (!canvas) return;
                const c = canvas.getContext('2d');
                const data = audioBuf.getChannelData(0);
                const step = Math.max(1, Math.floor(data.length / width));
                const amp = height / 2;

                c.clearRect(0, 0, width, height);
                c.fillStyle = '#22c55e';
                for (let x = 0; x < width; x++) {
                    let min = 1.0;
                    let max = -1.0;
                    for (let j = 0; j < step; j++) {
                        const v = data[x * step + j] || 0;
                        if (v < min) min = v;
                        if (v > max) max = v;
                    }
                    c.fillRect(x, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
                }
            } catch (e) {
                console.error('waveform draw failed', e);
            }
        };
        draw();
        return () => { cancelled = true; };
    }, [url, width, height]);

    return <canvas ref={canvasRef} width={width} height={height} className="w-full rounded bg-zinc-950" />;
}
