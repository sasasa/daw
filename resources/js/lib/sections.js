// 曲構成（セクション）とタイミング計算のユーティリティ。

// 録音のレイテンシ補正で offset がセクション境界を少し跨ぐため、所属判定に持たせる許容幅（秒）。
export const SECTION_TOL = 0.3;

// 1 小節の長さ（秒）。BPM は 4分音符基準、unit は拍子の分母。
export function measureDurationSeconds(beats, unit, bpm) {
    return beats * (60 / bpm) * (4 / unit);
}

// セクション配列を、開始/終了小節付きに展開する（measures を順に積む）。
export function sectionRanges(sections) {
    let start = 1;
    return (sections ?? []).map((s) => {
        const range = { ...s, start, end: start + s.measures - 1 };
        start += s.measures;
        return range;
    });
}

// 指定小節が属するセクション（range）を返す。無ければ null。
export function sectionOfMeasure(sections, measureNumber) {
    return sectionRanges(sections).find((r) => measureNumber >= r.start && measureNumber <= r.end) ?? null;
}

// 指定小節の BPM。所属セクションに bpm があればそれを、無ければ曲の既定 BPM。
export function measureBpm(sections, defaultBpm, measureNumber) {
    const r = sectionOfMeasure(sections, measureNumber);
    return r && r.bpm ? r.bpm : defaultBpm;
}

// 指定小節のスウィング種別（セクション設定があれば優先、無ければ全体）。'0'|'8'|'16'。
export function measureSwing(sections, globalSwing, measureNumber) {
    const r = sectionOfMeasure(sections, measureNumber);
    const s = r && r.swing != null && r.swing !== '' ? r.swing : globalSwing;
    return s || '0';
}

// 4分拍内の位置 p(0..1) をスウィング（シャッフル）後の位置に変換する。
// type='8' は8分シャッフル、'16' は16分シャッフル。r は前ノリの割合（既定 2/3=三連）。
export function swingPos(p, type, r = 2 / 3) {
    const remap = (q) => (q < 0.5 ? q * (r / 0.5) : r + (q - 0.5) * ((1 - r) / 0.5));
    if (type === '8') return remap(p);
    if (type === '16') {
        const w = p < 0.5 ? 0 : 1; // 8分の窓
        const local = (p - w * 0.5) / 0.5;
        return w * 0.5 + remap(local) * 0.5;
    }
    return p;
}

// 指定小節(1始まり)の頭までの経過秒数を、各小節の拍子・BPM（セクション別）から積算する。
export function measureStartSeconds(pattern, defaultBpm, measureNumber, sections = []) {
    let t = 0;
    for (let m = 1; m < measureNumber; m++) {
        const mm = pattern.find((p) => p.measure === m);
        const beats = mm?.beats ?? 4;
        const unit = mm?.unit ?? 4;
        t += measureDurationSeconds(beats, unit, measureBpm(sections, defaultBpm, m));
    }
    return t;
}

// セクションの開始秒数。
export function sectionStartSeconds(pattern, defaultBpm, range, sections = []) {
    return measureStartSeconds(pattern, defaultBpm, range.start, sections);
}

// 録音(offset秒)が最も近いセクション開始のセクションを返す（レイテンシ補正で境界を跨いでも正しく分類）。
// 返り値は { range, index } または null。
export function nearestSection(offsetSec, pattern, defaultBpm, sections = []) {
    const ranges = sectionRanges(sections);
    if (!ranges.length) return null;
    let best = null;
    let bestIndex = -1;
    let bestDiff = Infinity;
    ranges.forEach((r, i) => {
        const s = measureStartSeconds(pattern, defaultBpm, r.start, sections);
        const d = Math.abs(offsetSec - s);
        if (d < bestDiff) {
            bestDiff = d;
            best = r;
            bestIndex = i;
        }
    });
    return { range: best, index: bestIndex };
}
