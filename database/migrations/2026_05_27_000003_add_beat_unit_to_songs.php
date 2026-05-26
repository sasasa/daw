<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// 拍子の分母（4分=4, 8分=8 など）。既定の拍子を「何分の何」で持てるようにする。
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->unsignedSmallInteger('beat_unit')->default(4)->after('beats_per_measure');
        });
    }

    public function down(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->dropColumn('beat_unit');
        });
    }
};
