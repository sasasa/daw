<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Song extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'bpm',
        'beats_per_measure',
        'sections',
        'chords',
        'swing',
        'swing_ratio',
        'export_signature',
        'export_audio_path',
        'export_video_signature',
        'export_video_path',
    ];

    // 内部パス等はクライアントへ送らない（取得は専用エンドポイント経由）。
    protected $hidden = [
        'export_audio_path',
        'export_signature',
        'export_video_path',
        'export_video_signature',
    ];

    protected $casts = [
        'bpm' => 'integer',
        'beats_per_measure' => 'integer',
        'sections' => 'array',
        'chords' => 'array',
        'swing_ratio' => 'integer',
    ];

    public function audioTracks(): HasMany
    {
        return $this->hasMany(AudioTrack::class);
    }

    public function drumTrack(): HasOne
    {
        return $this->hasOne(DrumTrack::class);
    }
}
