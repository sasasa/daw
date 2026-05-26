import React from 'react';
import { DRUMS, sixteenthsPerBeat, measureSlots } from '../../constants/drumMap';

// 選択中ツール（音価）に応じてグリッドの列を間引く（16分単位のステップ）。
// 4分=4, 8分=2, 16分=1。これで各音価を実際に打ち込める。
const STEP_BY_TOOL = { 4: 4, '4': 4, 8: 2, '8': 2, 16: 1, '16': 1, erase: 1 };

// 1 小節分の打ち込みグリッド（行=ドラムパート, 列=16分スロット）。
// beats/unit でその小節の拍子に追従する。
export default function DrumGrid({ measure, notes, beats, unit, tool, onCell }) {
    const spb = sixteenthsPerBeat(unit);
    const totalSlots = measureSlots(beats, unit);
    const step = STEP_BY_TOOL[tool] ?? 1;

    const isActive = (drumKey, beat, subdivision) =>
        notes.some(
            (n) => n.drumKey === drumKey && n.beat === beat && n.subdivision === subdivision
        );

    return (
        <div>
            <table className="border-collapse text-center text-xs">
                <tbody>
                    {DRUMS.map((drum) => (
                        <tr key={drum.key}>
                            <td className="sticky left-0 z-10 w-14 bg-zinc-900 pr-2 text-right font-medium text-zinc-400">
                                {drum.short}
                            </td>
                            {Array.from({ length: totalSlots }, (_, i) => {
                                const beat = Math.floor(i / spb) + 1;
                                const subdivision = i % spb;
                                const active = isActive(drum.key, beat, subdivision);
                                const onStep = i % step === 0;
                                const beatStart = subdivision === 0;
                                // 選択音価のステップ外のセルは押せない（淡色表示）。
                                return (
                                    <td key={i} className="p-0.5">
                                        <button
                                            onClick={() =>
                                                (onStep || active) &&
                                                onCell(measure, drum.key, beat, subdivision)
                                            }
                                            disabled={!onStep && !active}
                                            className={[
                                                'h-7 w-7 rounded-sm border',
                                                active
                                                    ? 'border-green-400 bg-green-500'
                                                    : onStep
                                                      ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
                                                      : 'border-transparent bg-zinc-950/40',
                                                beatStart ? 'ml-1' : '',
                                            ].join(' ')}
                                            aria-label={`${drum.key} m${measure} beat${beat} sub${subdivision}`}
                                        />
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    <tr>
                        <td />
                        {Array.from({ length: totalSlots }, (_, i) => {
                            const subdivision = i % spb;
                            return (
                                <td key={i} className="pt-1 text-[10px] text-zinc-600">
                                    {subdivision === 0 ? Math.floor(i / spb) + 1 : ''}
                                </td>
                            );
                        })}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
