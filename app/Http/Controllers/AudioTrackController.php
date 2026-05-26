<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreAudioTrackRequest;
use App\Models\AudioTrack;
use App\Models\Song;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AudioTrackController extends Controller
{
    public function store(StoreAudioTrackRequest $request, Song $song): RedirectResponse
    {
        $file = $request->file('audio');
        $path = $file->store('audio', 'local');

        $track = $song->audioTracks()->create([
            'name' => $request->input('name'),
            'file_path' => $path,
            'mime_type' => $file->getMimeType() ?: 'audio/webm',
            'duration_ms' => (int) $request->input('duration_ms', 0),
            'offset_ms' => (int) $request->input('offset_ms', 0),
        ]);

        return response()->json($track);
    }

    // 録音一覧を JSON で返す（録音操作後のクライアント側即時更新用）。
    public function index(Song $song)
    {
        return response()->json($song->audioTracks()->latest()->get());
    }

    public function update(Request $request, AudioTrack $audioTrack)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'offset_ms' => ['sometimes', 'integer', 'min:0'],
            'notation' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);

        $audioTrack->update($validated);

        return response()->json(['ok' => true]);
    }

    public function destroy(AudioTrack $audioTrack)
    {
        Storage::disk('local')->delete($audioTrack->file_path);
        $audioTrack->delete();

        return response()->json(['ok' => true]);
    }

    // セクション複製用: 既存トラックのファイルを複製し、新しい offset で配置する（複数まとめて）。
    public function duplicateMany(Request $request, Song $song): RedirectResponse
    {
        $validated = $request->validate([
            'items' => ['present', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.offset_ms' => ['required', 'integer', 'min:0'],
            'items.*.name' => ['nullable', 'string', 'max:255'],
        ]);

        $disk = Storage::disk('local');
        foreach ($validated['items'] as $item) {
            $src = $song->audioTracks()->find($item['id']);
            if (! $src || ! $disk->exists($src->file_path)) {
                continue;
            }
            $ext = pathinfo($src->file_path, PATHINFO_EXTENSION);
            $newPath = 'audio/'.(string) Str::uuid().($ext ? '.'.$ext : '');
            $disk->copy($src->file_path, $newPath);

            $song->audioTracks()->create([
                'name' => $item['name'] ?? $src->name.' (コピー)',
                'file_path' => $newPath,
                'mime_type' => $src->mime_type,
                'duration_ms' => $src->duration_ms,
                'offset_ms' => $item['offset_ms'],
            ]);
        }

        return response()->json(['ok' => true]);
    }

    // セクション削除用: 指定 ID のトラックをファイルごとまとめて削除する。
    public function destroyMany(Request $request, Song $song): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => ['integer'],
        ]);

        $disk = Storage::disk('local');
        foreach ($validated['ids'] as $id) {
            $track = $song->audioTracks()->find($id);
            if ($track) {
                $disk->delete($track->file_path);
                $track->delete();
            }
        }

        return response()->json(['ok' => true]);
    }

    // セクション並べ替え用: 複数トラックの offset_ms をまとめて更新する。
    public function updateOffsets(Request $request, Song $song): RedirectResponse
    {
        $validated = $request->validate([
            'items' => ['present', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.offset_ms' => ['required', 'integer', 'min:0'],
        ]);

        foreach ($validated['items'] as $item) {
            $track = $song->audioTracks()->find($item['id']);
            if ($track) {
                $track->update(['offset_ms' => $item['offset_ms']]);
            }
        }

        return response()->json(['ok' => true]);
    }

    public function stream(AudioTrack $audioTrack): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($audioTrack->file_path), 404);

        return Storage::disk('local')->response(
            $audioTrack->file_path,
            null,
            ['Content-Type' => $audioTrack->mime_type]
        );
    }
}
