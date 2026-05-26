<?php

use App\Http\Controllers\AudioTrackController;
use App\Http\Controllers\DrumTrackController;
use App\Http\Controllers\SongController;
use Illuminate\Support\Facades\Route;

// 曲一覧・作成
Route::get('/', [SongController::class, 'index'])->name('songs.index');
Route::post('/songs', [SongController::class, 'store'])->name('songs.store');

// メインエディター
Route::get('/songs/{song}/edit', [SongController::class, 'edit'])->name('songs.edit');
Route::get('/songs/{song}/print', [SongController::class, 'print'])->name('songs.print');
Route::patch('/songs/{song}', [SongController::class, 'update'])->name('songs.update');
Route::delete('/songs/{song}', [SongController::class, 'destroy'])->name('songs.destroy');

// ドラムパターン保存
Route::put('/songs/{song}/drum-track', [DrumTrackController::class, 'upsert'])->name('drum-track.upsert');

// 曲構成（セクション）保存
Route::put('/songs/{song}/sections', [SongController::class, 'updateSections'])->name('songs.sections.update');

// 自動保存（曲情報・構成・ドラムをまとめて）
Route::put('/songs/{song}/autosave', [SongController::class, 'autosave'])->name('songs.autosave');

// 書き出しミックス(WAV)のサーバーキャッシュ
Route::get('/songs/{song}/export-cache', [SongController::class, 'exportCache'])->name('songs.export-cache');
Route::post('/songs/{song}/export-cache', [SongController::class, 'storeExportCache'])->name('songs.export-cache.store');
Route::get('/songs/{song}/export-cache/audio', [SongController::class, 'streamExportCache'])->name('songs.export-cache.audio');
Route::post('/songs/{song}/export-cache/video', [SongController::class, 'storeExportVideoCache'])->name('songs.export-cache.video.store');
Route::get('/songs/{song}/export-cache/video', [SongController::class, 'streamExportVideoCache'])->name('songs.export-cache.video');

// 録音ファイル
Route::get('/songs/{song}/audio-tracks', [AudioTrackController::class, 'index'])->name('audio-tracks.index');
Route::post('/songs/{song}/audio-tracks', [AudioTrackController::class, 'store'])->name('audio-tracks.store');
Route::post('/songs/{song}/audio-tracks/duplicate', [AudioTrackController::class, 'duplicateMany'])->name('audio-tracks.duplicate-many');
Route::post('/songs/{song}/audio-tracks/offsets', [AudioTrackController::class, 'updateOffsets'])->name('audio-tracks.offsets');
Route::post('/songs/{song}/audio-tracks/delete', [AudioTrackController::class, 'destroyMany'])->name('audio-tracks.destroy-many');
Route::delete('/audio-tracks/{audioTrack}', [AudioTrackController::class, 'destroy'])->name('audio-tracks.destroy');
Route::patch('/audio-tracks/{audioTrack}', [AudioTrackController::class, 'update'])->name('audio-tracks.update');

// 音声ファイルストリーミング
Route::get('/audio/{audioTrack}', [AudioTrackController::class, 'stream'])->name('audio.stream');
