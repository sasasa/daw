// ドラムパート定義（設計書 5-3）
// VexFlow の単一五線（percussion）上での音高と符頭、Tone.js 用の発音設定を一元管理する。
// row は打ち込みグリッドの上から順の並び（高音→低音）。

export const DRUMS = [
    { key: 'CY', label: 'Crash', short: 'CY', pitch: 'b/5', notehead: 'x', row: 0 },
    { key: 'HH', label: 'Hi-Hat', short: 'HH', pitch: 'a/5', notehead: 'x', row: 1 },
    { key: 'HT', label: 'High Tom', short: 'HT', pitch: 'e/5', notehead: 'normal', row: 2 },
    { key: 'SN', label: 'Snare', short: 'SN', pitch: 'c/5', notehead: 'normal', row: 3 },
    { key: 'FT', label: 'Floor Tom', short: 'FT', pitch: 'g/5', notehead: 'normal', row: 4 },
    { key: 'BD', label: 'Bass Drum', short: 'BD', pitch: 'a/4', notehead: 'normal', row: 5 },
];

export const DRUM_BY_KEY = Object.fromEntries(DRUMS.map((d) => [d.key, d]));

// 音価ごとの 1 拍内の分割数（subdivision の総数 = beat あたりのスロット数）
export const DURATIONS = [
    { value: '4', label: '♩ 4分', slotsPerBeat: 1 },
    { value: '8', label: '♪ 8分', slotsPerBeat: 2 },
    { value: '16', label: '♬ 16分', slotsPerBeat: 4 },
];

export const DURATION_BY_VALUE = Object.fromEntries(DURATIONS.map((d) => [d.value, d]));

// グリッド入力の最小分解能（16分音符 = 4分音符を 4 分割）
export const SLOTS_PER_BEAT = 4;

// 拍子の分母（音価）候補と既定値
export const DENOMINATORS = [2, 4, 8, 16];
export const DEFAULT_UNIT = 4;

// 拍子の分母 unit における 1 拍あたりの 16分スロット数。
// 例: /4 → 4, /8 → 2, /2 → 8, /16 → 1
export const sixteenthsPerBeat = (unit) => 16 / unit;

// 1 小節の総 16分スロット数。
export const measureSlots = (beats, unit) => beats * sixteenthsPerBeat(unit);
