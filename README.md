# DAW — ブラウザで動くシンプルなDAW

ブラウザ上で録音・ドラム打ち込み・譜面作成・書き出しができるシンプルな DAW です。
オーディオインターフェースからギター/ボーカル/ベースを録音し、ドラムは専用の打ち込みUIで作成できます。

- **フロント**: React + [Tone.js](https://tonejs.github.io/)（オーディオ）+ [VexFlow](https://www.vexflow.com/)（楽譜描画）
- **バック**: Laravel 13 + Inertia.js
- **実行環境**: Laravel Sail（Docker）/ MySQL / Redis / Vite

## 主な機能

- オーディオIF からの多チャンネル録音（セクション単位・カウントイン・レイテンシ補正）
- ドラム譜面の打ち込み（プリセット、拍子・スウィング、セクション別BPM）
- ギター/ベースのタブ譜、ボーカルの歌詞入力（チャンネル名に追従）
- 曲構成（セクション）編集、コード入力、印刷用バンド譜面
- 再生 / 一時停止 / 波形ドラッグでシーク / 譜面追従 / 「横再生」
- 音楽ファイル書き出し（**WAV / MP3**）
- 音楽に同期した幾何学ビジュアライザー動画の書き出し（**MP4**、踊る猫・歌詞オーバーレイ付き）
- ミックス・動画はバックグラウンドで事前生成し、サーバーにキャッシュ

## 必要なもの

- Docker / Docker Compose（[Docker Desktop](https://www.docker.com/products/docker-desktop/) など）
- Git
- ※ ホストに PHP / Node は不要（すべて Sail コンテナ内で動かせます）

## セットアップ

### 1. クローンと .env

```bash
git clone git@github.com:sasasa/daw.git
cd daw
cp .env.example .env
```

`.env` を以下のように設定します（MySQL / Redis を使う構成）。`APP_PORT` は公開ポート（既定 80、衝突する場合は 8080 など）。

```env
APP_URL=http://localhost:8080
APP_PORT=8080

DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=laravel
DB_USERNAME=sail
DB_PASSWORD=password

REDIS_HOST=redis
```

### 2. 依存パッケージのインストール

初回は Composer をワンショットコンテナで実行します（ホストに PHP 不要）。

```bash
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$(pwd):/var/www/html" \
  -w /var/www/html \
  laravelsail/php83-composer:latest \
  composer install --ignore-platform-reqs
```

### 3. コンテナ起動・初期化

```bash
./vendor/bin/sail up -d            # laravel.test / mysql / redis を起動
./vendor/bin/sail artisan key:generate
./vendor/bin/sail artisan migrate
./vendor/bin/sail npm install
```

> `sail` を毎回打つのが面倒なら alias を設定すると便利です:
> `alias sail='[ -f sail ] && sh sail || sh vendor/bin/sail'`

### 4. フロントエンドのビルド / 開発サーバ

開発時（HMR・ホットリロード）:

```bash
./vendor/bin/sail npm run dev
```

本番ビルド:

```bash
./vendor/bin/sail npm run build
```

### 5. アクセス

ブラウザで `http://localhost:8080`（`APP_PORT` で指定したポート）を開きます。
トップの曲一覧から新規作成し、エディタで録音・打ち込み・書き出しができます。

## 動作環境の注意

- **MP4 書き出しは WebCodecs API を使用**します。**Chrome / Edge 推奨**です。未対応ブラウザでは自動的に WebM（実時間録画）にフォールバックします。
- 録音にはマイク/入力デバイスのアクセス許可が必要です。
- 書き出し（ミックス WAV・動画）はサーバーの `storage/app/private/exports` にキャッシュされます（Git 管理外）。
- ローカル開発は `http://localhost` で動かしてください（録音や `crypto.subtle` などのセキュアコンテキストが必要なため）。

## よく使うコマンド

```bash
./vendor/bin/sail up -d            # 起動
./vendor/bin/sail down             # 停止
./vendor/bin/sail artisan migrate  # マイグレーション
./vendor/bin/sail npm run dev      # フロント開発サーバ
./vendor/bin/sail artisan test     # テスト
```

## ライセンス

本リポジトリのアプリケーションコードは個人プロジェクトです。基盤の Laravel フレームワークは MIT ライセンスです。
