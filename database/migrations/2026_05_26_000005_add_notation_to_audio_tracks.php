<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audio_tracks', function (Blueprint $table) {
            // コード名 / タブ譜の手入力テキスト
            $table->text('notation')->nullable()->after('offset_ms');
        });
    }

    public function down(): void
    {
        Schema::table('audio_tracks', function (Blueprint $table) {
            $table->dropColumn('notation');
        });
    }
};
