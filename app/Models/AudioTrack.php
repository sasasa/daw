<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AudioTrack extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'file_path',
        'mime_type',
        'duration_ms',
        'offset_ms',
        'notation',
    ];

    protected $casts = [
        'duration_ms' => 'integer',
        'offset_ms' => 'integer',
    ];

    protected $appends = ['url'];

    public function song(): BelongsTo
    {
        return $this->belongsTo(Song::class);
    }

    public function getUrlAttribute(): string
    {
        return route('audio.stream', $this);
    }
}
