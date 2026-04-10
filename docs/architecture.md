# 技術アーキテクチャ

## 設計原則
1. **OSS優先**: ArcGISなど商用ライセンスを使わない（コスト＆ベンダーロックイン回避）
2. **静的優先**: できる限りサーバーレス・静的配信で安く速く
3. **モバイルファースト**: スマホで使われる前提でUIを設計
4. **データ更新の自動化**: GitHub Actions等で月次更新可能に
5. **PWA**: 災害時のオフライン利用を想定

## 全体構成図（テキスト）
```
[市民/職員のブラウザ・スマホ]
        │
        ▼
[Vercel: Next.js 15 (App Router)]
   ├── 静的UI（React/Tailwind/shadcn）
   ├── MapLibre GL JS（地図描画）
   └── PWA Service Worker
        │
        ▼
[Cloudflare R2: PMTiles 配信]
   ├── 廃棄物処理施設.pmtiles
   ├── ゴミ収集エリア.pmtiles
   ├── 下水道管.pmtiles
   └── 側溝.pmtiles
        │
[国土地理院ベクトルタイル: ベースマップ]
   https://cyberjapandata.gsi.go.jp/xyz/...

[GitHub Actions: 月次データ更新ジョブ]
   ├── 各オープンデータ取得
   ├── QGIS/GDALで変換
   └── PMTiles生成 → R2へアップ
```

## なぜMapLibre GL JS？
- **OSS** (Apache 2.0): Mapboxが商用化した後にコミュニティがフォーク
- **トークン不要**: Mapboxと違いAPI Keyなしで使える
- **ベクタータイル対応**: 高速・高品質・スタイル変更自在
- **PMTiles対応**: 単一ファイルでサーバーレス配信可能
- **国土地理院ベクトルタイルとの親和性**: 公式が想定するクライアント

## なぜPMTiles？
- 単一の `.pmtiles` ファイルにベクタータイル全部を格納
- HTTPの **Range Request** だけで必要部分を取得できる
- **Vercel / Cloudflare R2 / S3 のような静的ホスティングで配信可能**
- 従来の MBTiles のように tile server を立てる必要がない
- データ更新は「ファイル差し替え」だけ

## なぜArcGISを使わないか
- ライセンスコスト（年額数十万〜）→ MVP段階で重い
- 自治体提案時の差別化ポイントになる（既存たみまっぷはArcGIS）
- データロックイン
- カスタマイズの自由度が低い

## データフロー（例: 廃棄物処理施設レイヤ）
1. 伊丹市オープンデータ（CSV: 施設名・住所・緯度経度）を取得
   `scripts/fetch_facilities.sh`
2. CSV → GeoJSON 変換
   `scripts/convert_facilities.py`（GeoPandas）
3. GeoJSON → PMTiles 変換
   `tippecanoe -o facilities.pmtiles facilities.geojson`
4. Cloudflare R2 へアップロード
   `wrangler r2 object put`
5. フロントから `https://r2.example.com/facilities.pmtiles` を読み込み

## ゴミ収集エリア → 住所検索の設計
```
[ユーザーが住所入力]
        │
        ▼
[国土地理院ジオコーディングAPI で 緯度経度に変換]
        │
        ▼
[フロントで Turf.js を使い、収集エリアGeoJSONとの point-in-polygon]
        │
        ▼
[該当エリアの収集曜日と分別ルールを表示]
```
※ 完全クライアントサイドで動作 → サーバー不要

## ディレクトリ構成（frontend/）
```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # 地図画面
│   ├── api/
│   │   └── geocode/route.ts  # 住所検索プロキシ（CORS回避）
│   └── manifest.ts           # PWA manifest
├── components/
│   ├── Map/
│   │   ├── MapView.tsx       # MapLibre GL ラッパー
│   │   ├── LayerToggle.tsx
│   │   └── SearchBar.tsx
│   └── ui/                   # shadcn/ui
├── lib/
│   ├── map-style.ts          # MapLibre スタイル定義
│   └── layers.ts             # レイヤ定義
├── public/
│   └── icons/                # PWAアイコン
└── package.json
```

## セキュリティ・プライバシー
- 個人情報を扱わない設計（住所検索もクライアント完結）
- データはすべてオープンデータ（CC BY 4.0等）
- GDPR/個人情報保護法対応の必要なし（Phase 1時点）
- HTTPS強制、CSP適用

## 想定コスト（Phase 1）
- Vercel: Hobbyプラン無料
- Cloudflare R2: 10GBまで無料、エグレス完全無料
- ドメイン: 年1,500円程度
- 国土地理院タイル: 無料
- **月額ランニングコスト: ほぼゼロ**
