import React, { useRef, useState } from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';

// 曲一覧 + 新規作成。クリックでエディタ(GET /songs/{id}/edit)へ遷移する。
export default function Index({ songs }) {
    const [creating, setCreating] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileRef = useRef(null);

    // プロジェクト(zip)を読み込んで新しい曲として復元する。
    const importProject = (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // 同じファイルを連続選択できるようにリセット
        if (!file) return;
        setImporting(true);
        router.post(
            route('songs.import'),
            { file },
            {
                forceFormData: true,
                onError: (errs) => alert(`読み込みに失敗しました: ${errs.file ?? '不明なエラー'}`),
                onFinish: () => setImporting(false),
            }
        );
    };
    const { data, setData, post, processing, reset, errors } = useForm({
        title: '',
        bpm: 120,
        beats_per_measure: 4,
    });

    const submit = (e) => {
        e.preventDefault();
        post(route('songs.store'), {
            onSuccess: () => {
                reset();
                setCreating(false);
            },
        });
    };

    const destroy = (song) => {
        if (confirm(`「${song.title}」を削除しますか？`)) {
            router.delete(route('songs.destroy', song.id));
        }
    };

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100">
            <Head title="曲一覧" />
            <div className="mx-auto max-w-3xl px-4 py-10">
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold">My Songs</h1>
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".zip,application/zip"
                            onChange={importProject}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={importing}
                            className="rounded bg-zinc-700 px-4 py-2 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-50"
                            title="書き出したプロジェクト(zip)を読み込む"
                        >
                            {importing ? '読み込み中…' : '⬆ プロジェクト読込'}
                        </button>
                        <button
                            onClick={() => setCreating((v) => !v)}
                            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold hover:bg-green-500"
                        >
                            + 新規作成
                        </button>
                    </div>
                </div>

                {creating && (
                    <form onSubmit={submit} className="mb-6 rounded-lg bg-zinc-800 p-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col text-sm">
                                <span className="mb-1 text-zinc-400">曲名</span>
                                <input
                                    autoFocus
                                    value={data.title}
                                    onChange={(e) => setData('title', e.target.value)}
                                    className="rounded bg-zinc-700 px-3 py-2 outline-none"
                                    placeholder="My Song"
                                />
                            </label>
                            <label className="flex flex-col text-sm">
                                <span className="mb-1 text-zinc-400">BPM</span>
                                <input
                                    type="number"
                                    value={data.bpm}
                                    onChange={(e) => setData('bpm', Number(e.target.value))}
                                    className="w-24 rounded bg-zinc-700 px-3 py-2 outline-none"
                                />
                            </label>
                            <label className="flex flex-col text-sm">
                                <span className="mb-1 text-zinc-400">拍子(分子)</span>
                                <input
                                    type="number"
                                    value={data.beats_per_measure}
                                    onChange={(e) => setData('beats_per_measure', Number(e.target.value))}
                                    className="w-20 rounded bg-zinc-700 px-3 py-2 outline-none"
                                />
                            </label>
                            <button
                                disabled={processing}
                                className="rounded bg-green-600 px-4 py-2 text-sm font-semibold hover:bg-green-500 disabled:opacity-50"
                            >
                                作成
                            </button>
                        </div>
                        {errors.title && <p className="mt-2 text-sm text-red-400">{errors.title}</p>}
                    </form>
                )}

                <ul className="divide-y divide-zinc-800 rounded-lg bg-zinc-800">
                    {songs.length === 0 && (
                        <li className="px-4 py-8 text-center text-zinc-500">曲がありません</li>
                    )}
                    {songs.map((song) => (
                        <li key={song.id} className="flex items-center justify-between px-4 py-3">
                            <Link
                                href={route('songs.edit', song.id)}
                                className="flex-1 font-medium hover:text-green-400"
                            >
                                {song.title}
                                <span className="ml-3 text-sm text-zinc-500">BPM {song.bpm}</span>
                            </Link>
                            <a
                                href={route('songs.export', song.id)}
                                className="ml-4 rounded px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
                                title="プロジェクト(zip)を書き出す"
                            >
                                ⬇ 書き出し
                            </a>
                            <button
                                onClick={() => destroy(song)}
                                className="ml-2 rounded px-2 py-1 text-sm text-red-400 hover:bg-zinc-700"
                            >
                                削除
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
