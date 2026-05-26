<?php

namespace App\Http\Controllers;

use App\Models\Song;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class DrumTrackController extends Controller
{
    public function upsert(Request $request, Song $song): RedirectResponse
    {
        $validated = $request->validate([
            'pattern' => ['present', 'array'],
            'pattern.*.measure' => ['required', 'integer', 'min:1'],
            'pattern.*.beats' => ['nullable', 'integer', 'min:1', 'max:32'],
            'pattern.*.unit' => ['nullable', 'integer', 'in:1,2,4,8,16'],
            'pattern.*.notes' => ['present', 'array'],
            'pattern.*.notes.*.id' => ['required', 'string'],
            'pattern.*.notes.*.drumKey' => ['required', 'string'],
            'pattern.*.notes.*.beat' => ['required', 'integer'],
            'pattern.*.notes.*.subdivision' => ['required', 'integer'],
            'pattern.*.notes.*.duration' => ['required', 'string'],
        ]);

        $song->drumTrack()->updateOrCreate(
            ['song_id' => $song->id],
            ['pattern' => $validated['pattern']]
        );

        return back();
    }
}
