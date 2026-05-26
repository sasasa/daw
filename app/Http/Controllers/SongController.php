<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSongRequest;
use App\Http\Requests\UpdateSongRequest;
use App\Models\Song;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SongController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Songs/Index', [
            'songs' => Song::latest()->get(['id', 'title', 'bpm', 'updated_at']),
        ]);
    }

    public function store(StoreSongRequest $request): RedirectResponse
    {
        $song = Song::create($request->validated());

        return to_route('songs.edit', $song);
    }

    public function edit(Song $song): Response
    {
        return Inertia::render('Songs/Edit', [
            'song' => $song,
            'audioTracks' => $song->audioTracks()->latest()->get(),
            'drumTrack' => $song->drumTrack,
        ]);
    }

    // プロジェクト書き出し: 曲・ドラム・録音（音声ファイル含む）を 1 つの zip にまとめてダウンロード。
    // 別PCでこの zip を読み込めば同じ状態を再現できる。
    public function exportProject(Song $song)
    {
        $song->load(['drumTrack', 'audioTracks']);
        $disk = Storage::disk('local');

        $manifest = [
            'format' => 'daw-project',
            'version' => 1,
            'song' => [
                'title' => $song->title,
                'bpm' => $song->bpm,
                'beats_per_measure' => $song->beats_per_measure,
                'beat_unit' => $song->beat_unit,
                'sections' => $song->sections,
                'chords' => $song->chords,
                'lyrics' => $song->lyrics,
                'swing' => $song->swing,
                'swing_ratio' => $song->swing_ratio,
            ],
            'drum' => ['pattern' => $song->drumTrack?->pattern],
            'audioTracks' => [],
        ];

        $tmp = tempnam(sys_get_temp_dir(), 'daw');
        $zip = new \ZipArchive();
        $zip->open($tmp, \ZipArchive::OVERWRITE);

        foreach ($song->audioTracks as $i => $t) {
            $inZip = null;
            if ($t->file_path && $disk->exists($t->file_path)) {
                $ext = pathinfo($t->file_path, PATHINFO_EXTENSION) ?: 'webm';
                $inZip = "audio/{$i}.{$ext}";
                $zip->addFile($disk->path($t->file_path), $inZip);
            }
            $manifest['audioTracks'][] = [
                'name' => $t->name,
                'mime_type' => $t->mime_type,
                'duration_ms' => $t->duration_ms,
                'offset_ms' => $t->offset_ms,
                'notation' => $t->notation,
                'file' => $inZip,
            ];
        }

        $zip->addFromString('manifest.json', json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $zip->close();

        $name = $this->safeFilename($song->title).'.daw.zip';

        return response()->download($tmp, $name, ['Content-Type' => 'application/zip'])->deleteFileAfterSend(true);
    }

    // プロジェクト読み込み: 書き出した zip から曲・ドラム・録音を復元して新しい曲として作成する。
    public function importProject(\Illuminate\Http\Request $request): RedirectResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:512000'], // 最大500MB
        ]);

        $zip = new \ZipArchive();
        if ($zip->open($request->file('file')->getRealPath()) !== true) {
            return back()->withErrors(['file' => 'ZIP を開けませんでした。']);
        }

        $raw = $zip->getFromName('manifest.json');
        $data = $raw !== false ? json_decode($raw, true) : null;
        if (! is_array($data) || ($data['format'] ?? null) !== 'daw-project') {
            $zip->close();

            return back()->withErrors(['file' => 'DAW プロジェクトファイルではありません。']);
        }

        $s = $data['song'] ?? [];
        $song = Song::create([
            'title' => ($s['title'] ?? '無題').' (読み込み)',
            'bpm' => $s['bpm'] ?? 120,
            'beats_per_measure' => $s['beats_per_measure'] ?? 4,
            'beat_unit' => $s['beat_unit'] ?? 4,
            'sections' => $s['sections'] ?? [],
            'chords' => $s['chords'] ?? [],
            'lyrics' => $s['lyrics'] ?? [],
            'swing' => $s['swing'] ?? '0',
            'swing_ratio' => $s['swing_ratio'] ?? 66,
        ]);

        if (! empty($data['drum']['pattern'])) {
            $song->drumTrack()->create(['pattern' => $data['drum']['pattern']]);
        }

        $disk = Storage::disk('local');
        foreach ($data['audioTracks'] ?? [] as $t) {
            $path = '';
            if (! empty($t['file'])) {
                $bytes = $zip->getFromName($t['file']);
                if ($bytes !== false) {
                    $ext = pathinfo($t['file'], PATHINFO_EXTENSION) ?: 'webm';
                    $path = 'audio/'.\Illuminate\Support\Str::uuid().'.'.$ext;
                    $disk->put($path, $bytes);
                }
            }
            $song->audioTracks()->create([
                'name' => $t['name'] ?? 'Track',
                'file_path' => $path,
                'mime_type' => $t['mime_type'] ?? 'audio/webm',
                'duration_ms' => $t['duration_ms'] ?? 0,
                'offset_ms' => $t['offset_ms'] ?? 0,
                'notation' => $t['notation'] ?? null,
            ]);
        }
        $zip->close();

        return to_route('songs.edit', $song);
    }

    // 印刷用のバンド譜面（ドラム譜＋タブ譜）ページ。
    public function print(Song $song): Response
    {
        return Inertia::render('Songs/Print', [
            'song' => $song,
            'audioTracks' => $song->audioTracks()->latest()->get(),
            'drumTrack' => $song->drumTrack,
        ]);
    }

    public function update(UpdateSongRequest $request, Song $song): RedirectResponse
    {
        $song->update($request->validated());

        return back();
    }

    public function destroy(Song $song): RedirectResponse
    {
        $song->delete();

        return to_route('songs.index');
    }

    // 自動保存: 曲情報・構成・ドラムパターンをまとめて保存する（axios から呼ぶ・JSON応答）。
    public function autosave(\Illuminate\Http\Request $request, Song $song)
    {
        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'bpm' => ['sometimes', 'integer', 'min:20', 'max:300'],
            'beats_per_measure' => ['sometimes', 'integer', 'min:1', 'max:16'],
            'beat_unit' => ['sometimes', 'integer', 'in:1,2,4,8,16'],
            'sections' => ['sometimes', 'array'],
            'sections.*.id' => ['required', 'string'],
            'sections.*.name' => ['required', 'string', 'max:60'],
            'sections.*.measures' => ['required', 'integer', 'min:1', 'max:256'],
            'sections.*.bpm' => ['nullable', 'integer', 'min:20', 'max:300'],
            'sections.*.swing' => ['nullable', 'string', 'in:0,8,16'],
            'chords' => ['sometimes', 'nullable', 'array'],
            'lyrics' => ['sometimes', 'nullable', 'array'],
            'swing' => ['sometimes', 'string', 'in:0,8,16'],
            'swing_ratio' => ['sometimes', 'integer', 'min:50', 'max:85'],
            'pattern' => ['sometimes', 'array'],
        ]);

        $song->fill(\Illuminate\Support\Arr::only($validated, [
            'title', 'bpm', 'beats_per_measure', 'beat_unit', 'sections', 'chords', 'lyrics', 'swing', 'swing_ratio',
        ]))->save();

        if (array_key_exists('pattern', $validated)) {
            $song->drumTrack()->updateOrCreate(
                ['song_id' => $song->id],
                ['pattern' => $validated['pattern']]
            );
        }

        return response()->json(['ok' => true]);
    }

    // 書き出しミックスのサーバーキャッシュ情報を返す（署名と取得URL）。
    // 署名が現在の曲状態と一致するかはクライアント側で照合する。
    public function exportCache(Song $song)
    {
        $audioExists = $song->export_audio_path && Storage::disk('local')->exists($song->export_audio_path);
        $videoExists = $song->export_video_path && Storage::disk('local')->exists($song->export_video_path);

        return response()->json([
            'signature' => $audioExists ? $song->export_signature : null,
            'url' => $audioExists ? route('songs.export-cache.audio', $song) : null,
            'video' => [
                'signature' => $videoExists ? $song->export_video_signature : null,
                'url' => $videoExists ? route('songs.export-cache.video', $song) : null,
                'format' => $videoExists ? pathinfo($song->export_video_path, PATHINFO_EXTENSION) : null,
            ],
        ]);
    }

    // 書き出しミックス(WAV)を保存する。署名も合わせて記録し、古いファイルは削除する。
    public function storeExportCache(\Illuminate\Http\Request $request, Song $song)
    {
        $request->validate([
            'signature' => ['required', 'string', 'max:128'],
            'audio' => ['required', 'file', 'max:204800'], // 最大200MB
        ]);

        if ($song->export_audio_path && Storage::disk('local')->exists($song->export_audio_path)) {
            Storage::disk('local')->delete($song->export_audio_path);
        }

        $path = $request->file('audio')->store('exports', 'local');
        $song->update([
            'export_signature' => $request->input('signature'),
            'export_audio_path' => $path,
        ]);

        return response()->json(['ok' => true, 'url' => route('songs.export-cache.audio', $song)]);
    }

    // キャッシュ済みミックス(WAV)を配信する。
    public function streamExportCache(Song $song): StreamedResponse
    {
        abort_unless($song->export_audio_path && Storage::disk('local')->exists($song->export_audio_path), 404);

        return Storage::disk('local')->response($song->export_audio_path, null, ['Content-Type' => 'audio/wav']);
    }

    // 書き出し動画(MP4/WebM)を保存する。署名も記録し、古いファイルは削除する。
    public function storeExportVideoCache(\Illuminate\Http\Request $request, Song $song)
    {
        $request->validate([
            'signature' => ['required', 'string', 'max:128'],
            'video' => ['required', 'file', 'mimetypes:video/mp4,video/webm', 'max:204800'], // 最大200MB
        ]);

        if ($song->export_video_path && Storage::disk('local')->exists($song->export_video_path)) {
            Storage::disk('local')->delete($song->export_video_path);
        }

        $ext = $request->file('video')->getClientOriginalExtension() ?: 'mp4';
        $path = $request->file('video')->storeAs('exports', \Illuminate\Support\Str::uuid().'.'.$ext, 'local');
        $song->update([
            'export_video_signature' => $request->input('signature'),
            'export_video_path' => $path,
        ]);

        return response()->json(['ok' => true, 'url' => route('songs.export-cache.video', $song), 'format' => $ext]);
    }

    // キャッシュ済み動画を配信する（ダウンロード名は曲名）。
    public function streamExportVideoCache(Song $song): StreamedResponse
    {
        abort_unless($song->export_video_path && Storage::disk('local')->exists($song->export_video_path), 404);

        $ext = pathinfo($song->export_video_path, PATHINFO_EXTENSION);
        $type = $ext === 'webm' ? 'video/webm' : 'video/mp4';
        $name = $this->safeFilename($song->title).'.'.$ext;

        return Storage::disk('local')->download($song->export_video_path, $name, ['Content-Type' => $type]);
    }

    // ファイル名に使えない文字を除去。
    private function safeFilename(?string $name): string
    {
        $name = preg_replace('/[\\\\\\/:*?"<>|]/', '_', (string) $name);
        $name = trim($name);

        return $name !== '' ? $name : 'song';
    }

    // 曲構成（Aメロ等のセクション）を保存する。
    public function updateSections(\Illuminate\Http\Request $request, Song $song): RedirectResponse
    {
        $validated = $request->validate([
            'sections' => ['present', 'array'],
            'sections.*.id' => ['required', 'string'],
            'sections.*.name' => ['required', 'string', 'max:60'],
            'sections.*.measures' => ['required', 'integer', 'min:1', 'max:256'],
            'sections.*.bpm' => ['nullable', 'integer', 'min:20', 'max:300'],
            'sections.*.swing' => ['nullable', 'string', 'in:0,8,16'],
        ]);

        $song->update(['sections' => $validated['sections']]);

        return back();
    }
}
