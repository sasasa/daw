// 音楽に同期した幾何学ビジュアライザーの描画。
// analyzeForVideo() で得た各フレームの特徴量(bars/rms/bass/mid/treble)を 2D canvas に描く。
// drawFrame は副作用のみ（ctx へ描画）。録画・実時間プレビューの両方から使う。

// HSL 文字列。
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

// 正多角形パスを描く。
function polygonPath(ctx, cx, cy, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const a = rotation + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// 音楽に合わせて踊る猫を描く。size は猫の高さの目安。
// bass/rms でジャンプ、時間で左右にステップ＆体を傾け、ビートで前足を上げる。
function drawCat(ctx, cx, cy, size, feat, t) {
    const bass = feat.bass ?? 0;
    const rms = feat.rms ?? 0;
    const beat = Math.max(bass, rms * 0.8);
    const s = size;

    const step = Math.sin(t * 6); // 左右ステップ
    const bounce = beat * s * 0.45 + Math.abs(Math.sin(t * 3)) * s * 0.05; // ジャンプ
    const wiggle = step * s * 0.14;
    const tilt = step * 0.14;

    ctx.save();
    ctx.translate(cx + wiggle, cy - bounce);
    ctx.rotate(tilt);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const FUR = '#efa14a';
    const FUR_DARK = '#c6772b';
    const OUTLINE = '#5a3410';
    const stroke = (w) => {
        ctx.lineWidth = w;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
    };

    // しっぱ（時間で揺れる）
    ctx.beginPath();
    const tailSway = Math.sin(t * 5) * 0.5;
    ctx.moveTo(s * 0.26, s * 0.42);
    ctx.quadraticCurveTo(s * (0.6 + tailSway * 0.2), s * (0.3 + tailSway), s * 0.5, s * (0.05 + tailSway * 0.4));
    ctx.lineWidth = s * 0.12;
    ctx.strokeStyle = FUR;
    ctx.stroke();
    ctx.lineWidth = s * 0.12;

    // 胴体
    ctx.beginPath();
    ctx.ellipse(0, s * 0.34, s * 0.30, s * 0.40, 0, 0, Math.PI * 2);
    ctx.fillStyle = FUR;
    ctx.fill();
    stroke(s * 0.03);

    // 後ろ足（左右で交互に上下＝ステップ）
    for (const dir of [-1, 1]) {
        const lift = Math.max(0, dir * step) * s * 0.08;
        ctx.beginPath();
        ctx.ellipse(dir * s * 0.16, s * 0.66 - lift, s * 0.10, s * 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = FUR;
        ctx.fill();
        stroke(s * 0.025);
    }

    // 前足（ビートで上げて踊る）
    for (const dir of [-1, 1]) {
        const raise = beat * s * 0.18 * (dir > 0 ? 1 : 0.6);
        ctx.beginPath();
        ctx.ellipse(dir * s * 0.20, s * 0.30 - raise, s * 0.08, s * 0.12, dir * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = FUR;
        ctx.fill();
        stroke(s * 0.025);
    }

    // 頭
    const hy = -s * 0.18;
    ctx.beginPath();
    ctx.arc(0, hy, s * 0.30, 0, Math.PI * 2);
    ctx.fillStyle = FUR;
    ctx.fill();
    stroke(s * 0.03);

    // 耳
    for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * s * 0.12, hy - s * 0.22);
        ctx.lineTo(dir * s * 0.30, hy - s * 0.42);
        ctx.lineTo(dir * s * 0.30, hy - s * 0.16);
        ctx.closePath();
        ctx.fillStyle = FUR;
        ctx.fill();
        stroke(s * 0.025);
        // 耳の内側
        ctx.beginPath();
        ctx.moveTo(dir * s * 0.17, hy - s * 0.22);
        ctx.lineTo(dir * s * 0.27, hy - s * 0.35);
        ctx.lineTo(dir * s * 0.27, hy - s * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#f7c9a6';
        ctx.fill();
    }

    // 目（時々まばたき）
    const blink = Math.sin(t * 2.3) > 0.96 ? 0.15 : 1;
    for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(dir * s * 0.12, hy - s * 0.02, s * 0.05, s * 0.07 * blink, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#1d1208';
        ctx.fill();
        if (blink > 0.5) {
            ctx.beginPath();
            ctx.arc(dir * s * 0.12 + s * 0.015, hy - s * 0.04, s * 0.015, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }
    }

    // 鼻と口
    ctx.beginPath();
    ctx.moveTo(-s * 0.03, hy + s * 0.08);
    ctx.lineTo(s * 0.03, hy + s * 0.08);
    ctx.lineTo(0, hy + s * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#d8607a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, hy + s * 0.12);
    ctx.quadraticCurveTo(-s * 0.06, hy + s * 0.17, -s * 0.1, hy + s * 0.13);
    ctx.moveTo(0, hy + s * 0.12);
    ctx.quadraticCurveTo(s * 0.06, hy + s * 0.17, s * 0.1, hy + s * 0.13);
    ctx.lineWidth = s * 0.02;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    // ひげ
    ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    for (const dir of [-1, 1]) {
        for (const dy of [-0.02, 0.04, 0.1]) {
            ctx.beginPath();
            ctx.moveTo(dir * s * 0.08, hy + s * 0.08);
            ctx.lineTo(dir * s * 0.34, hy + s * (0.08 + dy));
            ctx.stroke();
        }
    }

    ctx.restore();
}

// 1フレーム描画。
// feat: { bars:Float32Array, rms, bass, mid, treble }
// frameIndex / fps: 経過時間（色相・回転の進行に使う）
// lyric: その時刻に表示する歌詞（無ければ空文字）
export function drawFrame(ctx, width, height, feat, frameIndex, fps, lyric = '') {
    const t = frameIndex / fps;
    const cx = width / 2;
    const cy = height / 2;
    const bass = feat.bass ?? 0;
    const mid = feat.mid ?? 0;
    const treble = feat.treble ?? 0;
    const rms = feat.rms ?? 0;
    const bars = feat.bars ?? new Float32Array(0);
    const baseHue = (t * 18) % 360; // ゆっくり色が回る

    // 背景: 中心が低域でわずかに発光する放射グラデーション。
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
    g.addColorStop(0, hsl(baseHue + 200, 60, 6 + bass * 16));
    g.addColorStop(1, '#05060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const unit = Math.min(width, height);
    const ringR = unit * 0.26;

    // 円環状スペクトラム（バーを中心から放射）。
    const n = bars.length;
    if (n > 0) {
        ctx.lineCap = 'round';
        // 上半分と鏡像で全周に配置。
        for (let i = 0; i < n; i++) {
            const v = bars[i];
            const len = ringR * 0.15 + v * ringR * 0.95;
            const hue = baseHue + (i / n) * 140;
            for (const dir of [1, -1]) {
                const ang = -Math.PI / 2 + dir * (i / n) * Math.PI;
                const x1 = cx + Math.cos(ang) * ringR;
                const y1 = cy + Math.sin(ang) * ringR;
                const x2 = cx + Math.cos(ang) * (ringR + len);
                const y2 = cy + Math.sin(ang) * (ringR + len);
                ctx.strokeStyle = hsl(hue, 90, 55 + v * 20, 0.9);
                ctx.lineWidth = Math.max(1.5, (unit / n) * 0.6);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }
    }

    // 中央の回転する幾何学図形（多重ポリゴン）。サイズは低域でパルス。
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const layers = 4;
    for (let l = 0; l < layers; l++) {
        const sides = 3 + l; // 三角形→四角→五角→六角
        const rot = t * (0.5 + l * 0.25) * (l % 2 ? -1 : 1);
        const pulse = 1 + bass * 0.5 + rms * 0.2;
        const r = ringR * (0.2 + l * 0.16) * pulse;
        const hue = baseHue + l * 40 + treble * 60;
        polygonPath(ctx, cx, cy, r, sides, rot);
        ctx.strokeStyle = hsl(hue, 95, 60, 0.85);
        ctx.lineWidth = 2 + mid * 4;
        ctx.shadowBlur = 12 + treble * 30;
        ctx.shadowColor = hsl(hue, 95, 60, 0.9);
        ctx.stroke();
    }
    ctx.restore();

    // 中心のコア（音量で明滅）。
    const coreR = unit * 0.02 + rms * unit * 0.06;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
    cg.addColorStop(0, hsl(baseHue + 40, 100, 85, 0.9));
    cg.addColorStop(1, hsl(baseHue + 40, 100, 60, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
    ctx.fill();

    // 音楽に合わせて踊る猫（幾何学の手前・中央）。
    drawCat(ctx, cx, cy + unit * 0.04, unit * 0.17, feat, t);

    // 歌詞（下部中央）。読みやすいよう半透明の帯＋縁取りで描く。
    if (lyric) {
        let fontPx = Math.round(unit * 0.055);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 横幅に収まるようフォントを縮める。
        ctx.font = `bold ${fontPx}px sans-serif`;
        const maxW = width * 0.9;
        while (ctx.measureText(lyric).width > maxW && fontPx > 10) {
            fontPx -= 1;
            ctx.font = `bold ${fontPx}px sans-serif`;
        }
        const ly = height - unit * 0.1;
        const tw = ctx.measureText(lyric).width;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(cx - tw / 2 - 16, ly - fontPx * 0.8, tw + 32, fontPx * 1.6);
        ctx.lineWidth = Math.max(2, fontPx * 0.12);
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(lyric, cx, ly);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(lyric, cx, ly);
    }
}

// frameIndex 用に特徴量を1フレームぶん取り出すヘルパ。
export function featAt(analysis, frameIndex) {
    const i = Math.min(frameIndex, analysis.frameCount - 1);
    return {
        bars: analysis.bars[i],
        rms: analysis.rms[i],
        bass: analysis.bass[i],
        mid: analysis.mid[i],
        treble: analysis.treble[i],
    };
}
