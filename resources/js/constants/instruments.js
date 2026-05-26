// AUDIO TRACKS のチャンネル名（楽器）の選択肢。
export const INSTRUMENTS = ['ボーカル', 'ギター', 'ベース'];

// チャンネル名からタブ譜の楽器種別（guitar=6弦 / bass=4弦）を決める。
export function instrumentToTab(name) {
    if (name && name.includes('ベース')) return 'bass';
    return 'guitar'; // ギター・ボーカル・その他は6弦
}
