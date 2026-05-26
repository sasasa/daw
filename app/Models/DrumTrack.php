<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DrumTrack extends Model
{
    use HasFactory;

    protected $fillable = [
        'song_id',
        'pattern',
    ];

    protected $casts = [
        'pattern' => 'array',
    ];

    public function song(): BelongsTo
    {
        return $this->belongsTo(Song::class);
    }
}
