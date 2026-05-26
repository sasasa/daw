<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('drum_tracks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('song_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('pattern');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drum_tracks');
    }
};
