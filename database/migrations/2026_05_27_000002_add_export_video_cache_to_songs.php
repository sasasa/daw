<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// 書き出し動画(MP4/WebM)のサーバーキャッシュ。署名一致なら再エンコード不要。
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->string('export_video_signature')->nullable();
            $table->string('export_video_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->dropColumn(['export_video_signature', 'export_video_path']);
        });
    }
};
