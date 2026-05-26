<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// 書き出しミックス(WAV)のサーバーキャッシュ。署名(signature)が一致すれば再レンダリング不要。
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->string('export_signature')->nullable();
            $table->string('export_audio_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->dropColumn(['export_signature', 'export_audio_path']);
        });
    }
};
