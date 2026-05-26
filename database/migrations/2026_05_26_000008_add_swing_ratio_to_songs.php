<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            // スウィング比率（前ノリの割合 %）。50=ストレート, 66=三連。
            $table->unsignedTinyInteger('swing_ratio')->default(66)->after('swing');
        });
    }

    public function down(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->dropColumn('swing_ratio');
        });
    }
};
