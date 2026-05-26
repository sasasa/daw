import { SLOTS_PER_BEAT } from './drumMap';

// プリセット選択肢
export const GENRES = [
    { value: 'pops', label: 'Pops' },
    { value: 'rock', label: 'Rock' },
    { value: 'punk', label: 'Punk' },
    { value: 'hardcore', label: 'Hardcore' },
];
export const BEAT_TYPES = [
    { value: '8', label: '8ビート' },
    { value: '16', label: '16ビート' },
];
export const MEASURE_COUNTS = [4, 8, 12, 16, 24];

// 16ステップ（4/4・16分）の '1'/'0' 文字列を notes に変換する。
function stepsToNotes(map, res) {
    const notes = [];
    Object.entries(map).forEach(([drumKey, steps]) => {
        for (let s = 0; s < steps.length; s++) {
            if (steps[s] === '1') {
                notes.push({
                    drumKey,
                    beat: Math.floor(s / SLOTS_PER_BEAT) + 1,
                    subdivision: s % SLOTS_PER_BEAT,
                    duration: res,
                });
            }
        }
    });
    return notes;
}

// ジャンル定義。ハイハットは 8/16 ビートで切り替えるため kicks/sn のみ持つ。
const PRESETS = {
    pops: { crashStart: false, sn: '0000100000001000', kicks: ['1000000010000000', '1000000010100000'] },
    rock: { crashStart: true, sn: '0000100000001000', kicks: ['1000000010000000', '1010000010000000'] },
    punk: { crashStart: true, sn: '0000100000001000', kicks: ['1010101010101010', '1000000010000000'] },
    hardcore: { crashStart: true, sn: '0000100000001000', kicks: ['1010101010101010', '1010001010100010'] },
};

const HH_8 = '1010101010101010';
const HH_16 = '1111111111111111';
const head8 = (s) => s.slice(0, 8);

// 派手なフィル: スネア→ハイタム→フロアタムの16分ロール＋終端クラッシュ。
const BIG_FILL = {
    SN: '1111000000000000',
    HT: '0000111100000000',
    FT: '0000000011111100',
    CY: '0000000000000010',
    BD: '1000000000000000',
};

function grooveNotes(g, hh, kickIdx, crash) {
    const map = { HH: hh, SN: g.sn, BD: g.kicks[kickIdx % g.kicks.length] };
    if (crash) map.CY = '1000000000000000';
    return stepsToNotes(map, '8');
}

// 軽いフィル: 1〜2拍はグルーヴ、3〜4拍はスネア8分のフィル。
function lightFillNotes(g, hh, kickIdx) {
    const map = {
        HH: head8(hh) + '00000000',
        SN: head8(g.sn) + '10101010',
        BD: head8(g.kicks[kickIdx % g.kicks.length]) + '00000000',
    };
    return stepsToNotes(map, '16');
}

function bigFillNotes() {
    return stepsToNotes(BIG_FILL, '16');
}

// 8/16 ビート × 指定小節数のパターンを生成する。
// 4小節ごと(4,8,…)に軽いフィル、最終小節に派手なフィル、先頭にクラッシュ（ジャンル依存）。
// 返り値は各小節の notes テンプレート配列（id・小節番号なし）。
export function buildPresetPattern(genre, beatType, measures) {
    const g = PRESETS[genre] ?? PRESETS.pops;
    const hh = beatType === '16' ? HH_16 : HH_8;
    const bars = [];
    for (let i = 0; i < measures; i++) {
        const isLast = i === measures - 1;
        const isPhraseEnd = (i + 1) % 4 === 0;
        if (isLast) {
            bars.push(bigFillNotes());
        } else if (isPhraseEnd) {
            bars.push(lightFillNotes(g, hh, i));
        } else {
            bars.push(grooveNotes(g, hh, i, i === 0 && g.crashStart));
        }
    }
    return bars;
}
