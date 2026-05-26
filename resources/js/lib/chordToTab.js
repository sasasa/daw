// コード名 → タブの押さえ（パワーコード/ルート）への変換。

const PC = {
    C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5,
    'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11,
};

const TUN = {
    guitar: { open: [40, 45, 50, 55, 59, 64], max: 22 }, // 低音弦→高音弦 E A D G B e
    bass: { open: [28, 33, 38, 43], max: 24 }, // E A D G
};
const FRET_CAP = 8;

// コード名の頭からルートの pitch class を取る（品質 m/7 等は無視）。
function rootPc(name) {
    const m = (name || '').trim().match(/^([A-Ga-g])([#b]?)/);
    if (!m) return null;
    let pc = PC[m[1].toUpperCase()];
    if (pc == null) return null;
    if (m[2] === '#') pc = (pc + 1) % 12;
    if (m[2] === 'b') pc = (pc + 11) % 12;
    return pc;
}

// パワーコード（ルート＋5度＋オクターブ）。低音弦優先、8F以上なら上の弦へ。
function powerChord(midi, tuning) {
    const n = tuning.open.length;
    let fallback = null;
    for (let s = 0; s < n - 1; s++) {
        const fret = midi - tuning.open[s];
        if (fret >= 0 && fret <= tuning.max) {
            const sh = [
                { string: s, fret },
                { string: s + 1, fret: fret + 2 },
            ];
            if (s + 2 < n) sh.push({ string: s + 2, fret: fret + 2 });
            const v = sh.filter((p) => p.fret >= 0 && p.fret <= tuning.max);
            if (fret < FRET_CAP) return v;
            if (!fallback) fallback = v;
        }
    }
    return fallback || [];
}

// ルート単音（低音弦優先、8F以上なら上の弦へ）。
function rootNote(midi, tuning) {
    let fallback = null;
    for (let s = 0; s < tuning.open.length; s++) {
        const fret = midi - tuning.open[s];
        if (fret >= 0 && fret <= tuning.max) {
            if (fret < FRET_CAP) return [{ string: s, fret }];
            if (!fallback) fallback = [{ string: s, fret }];
        }
    }
    return fallback || [];
}

// コード名 → [{ string(低音弦=0), fret }]。ギターはパワーコード、ベースはルート単音。
export function chordToShapes(name, instrument) {
    const pc = rootPc(name);
    if (pc == null) return null;
    const tuning = TUN[instrument] || TUN.guitar;
    // 開放E(=pc4)以上の最低オクターブにルートを置く。
    const base = tuning.open[0];
    const midi = base + ((pc - 4 + 12) % 12);
    return instrument === 'bass' ? rootNote(midi, tuning) : powerChord(midi, tuning);
}
