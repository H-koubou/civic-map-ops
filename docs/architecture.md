# Civic Map Ops — 技術アーキテクチャ

## 設計原則
1. **どの自治体でも、コード変更なしで導入できる**（汎用性が最優先）
2. **OSS優先**: ArcGISなど商用ライセンスを使わない
3. **タブレット現場利用が最優先**: タッチターゲット・視認性・オフライン
4. **地図UXが最重要差別化軸**

## データの2層構造

```
┌───────────────────────────────────────────────────────┐
│  全国共通レイヤー（自動取得・コード不要）                │
│  ・公道: 国土地理院 最適化ベクトルタイル（国道/県道/市道）│
│  ・私道: OSM（国の測量対象外のため補完）                 │
│  → bbox を変えるだけで全国どこでも即座に利用可            │
└───────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────┐
│  テナント固有レイヤー（インポート or 手入力）             │
│  ・下水道管、側溝、マンホール、施設、消火栓…              │
│  → 自治体ごとにデータ形式が異なるため正規化して格納       │
│  → asset_types + attribute_definitions で              │
│    テーブル追加なしに任意のインフラ種別を定義可能          │
└───────────────────────────────────────────────────────┘
```

## 全体構成図

```
[現場オペレーター（タブレット）]
        │
        ▼
[Vercel: Next.js 15 (App Router)]
   ├── React + MapLibre GL JS
   ├── shadcn/ui + Tailwind CSS v4
   └── PWA Service Worker（オフライン記録）
        │
        ├──→ [国土地理院: ベースマップ + 道路中心線]
        │     ラスタータイル + 最適化ベクトルタイル
        │
        ├──→ [Supabase (PostGIS)]
        │     ├── assets（全インフラ共通テーブル）
        │     ├── inspections（現場記録）
        │     ├── cases（案件管理）
        │     └── RLS でテナント分離
        │
        └──→ [Supabase Storage / Cloudflare R2]
              ├── 点検写真
              └── PMTiles（大容量ベクタデータ）
```

## コアテーブル設計

### tenants（テナント = 自治体）
```sql
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,           -- 'itami', 'amagasaki'
  name_ja       TEXT NOT NULL,                  -- '伊丹市'
  display_label TEXT NOT NULL,                  -- '伊丹市 環境インフラ台帳'
  prefecture    TEXT NOT NULL,                  -- '兵庫県'
  jiscode       CHAR(6) NOT NULL,              -- 全国地方公共団体コード
  center_lng    DOUBLE PRECISION NOT NULL,
  center_lat    DOUBLE PRECISION NOT NULL,
  default_zoom  SMALLINT NOT NULL DEFAULT 14,
  boundary      GEOMETRY(Polygon, 4326),       -- 行政界（道路クリップ用）
  theme_primary TEXT DEFAULT '#006781',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### asset_types（インフラ種別 — テナントごとに追加可能）
```sql
CREATE TABLE asset_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),   -- NULL = 全テナント共通のデフォルト
  code          TEXT NOT NULL,                  -- 'sewer', 'ditch', 'manhole' ...
  name_ja       TEXT NOT NULL,                  -- '下水道管'
  geometry_type TEXT NOT NULL,                  -- 'Point' | 'LineString' | 'Polygon'
  icon          TEXT NOT NULL DEFAULT 'location_on',
  color         TEXT NOT NULL DEFAULT '#0891b2',
  unit_label    TEXT,                           -- '本', '基', '拠点'
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
```

デフォルト種別（シードデータ）:

| code | name_ja | geometry_type |
|------|---------|--------------|
| sewer | 下水道管 | LineString |
| ditch | 側溝・排水路 | LineString |
| manhole | マンホール | Point |
| grate | グレーチング | Point |
| facility | 処理施設 | Point |
| pump | ポンプ場 | Point |
| bridge | 橋梁 | LineString |

### attribute_definitions（動的属性定義 — 汎用性の鍵）
```sql
CREATE TABLE attribute_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type_id UUID NOT NULL REFERENCES asset_types(id),
  tenant_id     UUID REFERENCES tenants(id),
  key           TEXT NOT NULL,                  -- 'diameter', 'material'
  label_ja      TEXT NOT NULL,                  -- '管径'
  data_type     TEXT NOT NULL,                  -- 'text'|'number'|'select'|'date'|'boolean'
  unit          TEXT,                           -- 'mm', 'm'
  options       JSONB,                          -- select用: ["塩ビ管","RC管","陶管"]
  is_required   BOOLEAN NOT NULL DEFAULT false,
  sort_order    SMALLINT NOT NULL DEFAULT 0
);
```

伊丹市の下水道が「口径」「管種」、尼崎市が「管径(mm)」「管材質」でも、
attribute_definitions で定義するだけでUIが自動生成される。

### assets（全インフラ共通テーブル — 1テーブルで全種別）
```sql
CREATE TABLE assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  asset_type_id   UUID NOT NULL REFERENCES asset_types(id),
  asset_code      TEXT,                         -- 自治体独自の管理番号 'MH-1123'
  name            TEXT,
  geom            GEOMETRY(Geometry, 4326) NOT NULL,
  address         TEXT,
  length_m        DOUBLE PRECISION,
  install_year    SMALLINT,
  attributes      JSONB NOT NULL DEFAULT '{}',  -- {"diameter":800,"material":"RC管"}
  source          TEXT,                         -- 'shapefile_import','arcgis_sync','manual'
  source_id       TEXT,
  import_batch_id UUID,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_geom ON assets USING GIST (geom);
CREATE INDEX idx_assets_tenant_type ON assets (tenant_id, asset_type_id);
```

### inspections（現場記録）
```sql
CREATE TABLE inspections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  case_id         UUID REFERENCES cases(id),
  location        GEOMETRY(Point, 4326) NOT NULL,
  rating          TEXT,                         -- 'good','ok','warn','bad'
  memo            TEXT,
  measurements    JSONB NOT NULL DEFAULT '{}',
  checklist       JSONB NOT NULL DEFAULT '[]',
  road_class      TEXT,
  local_id        TEXT,                         -- オフライン重複排除用
  inspector_id    UUID,
  inspected_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### cases（案件管理）
```sql
CREATE TABLE cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  case_number     TEXT NOT NULL,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new',
  priority        TEXT NOT NULL DEFAULT 'normal',
  work_type       TEXT NOT NULL,                -- '点検','清掃','補修'
  location_point  GEOMETRY(Point, 4326),
  scheduled_date  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## インポートパイプライン

### 自治体ごとのデータ現状

```
伊丹市: ArcGIS FeatureServer → REST API で GeoJSON 取得可
尼崎市: コンサルが納品した Shapefile
西宮市: Excel台帳 + 住所
新規市: データなし → アプリで手入力
```

### import_batches（インポート履歴）
```sql
CREATE TABLE import_batches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  source_type          TEXT NOT NULL,           -- 'shapefile','geojson','csv','arcgis_featureserver'
  source_url           TEXT,
  source_filename      TEXT,
  target_asset_type_id UUID NOT NULL REFERENCES asset_types(id),
  field_mapping        JSONB NOT NULL DEFAULT '{}',
  source_srid          INTEGER DEFAULT 4326,
  status               TEXT NOT NULL DEFAULT 'pending',
  total_records        INTEGER,
  imported_count       INTEGER DEFAULT 0,
  error_count          INTEGER DEFAULT 0,
  error_log            JSONB DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### カラムマッピング

同じ「下水道管」でも自治体ごとにカラム名が違う：

| 保存先 | 伊丹市 | 尼崎市 | 西宮市 |
|--------|--------|--------|--------|
| asset_code | 管理番号 | 管渠番号 | 管番号 |
| attributes.diameter | 口径 | 管径(mm) | 管口径 |
| attributes.material | 管種 | 管材質 | 種別 |
| install_year | 布設年度 | 敷設年 | 施工年度 |

管理画面でドラッグ&ドロップでマッピング → 保存 → 次回更新は再利用。

### インポートUI フロー

```
/admin/import
  Step 1: ソース選択（ファイル / ArcGIS URL / 手入力）
  Step 2: インフラ種別選択（下水道管 / 側溝 / マンホール …）
  Step 3: ファイルアップロード → パース → プレビュー
  Step 4: カラムマッピングUI
  Step 5: プレビュー（10件 + ミニマップ）
  Step 6: 実行 → プログレスバー
  Step 7: 結果サマリ（取込/スキップ/エラー件数）
```

## テナント導入フロー（コード変更ゼロ）

```
1. tenants にレコード追加（市名、JISコード、地図中心座標）
2. GSI 道路データは bbox から自動取得（scripts/fetch_gsi_roads.js）
3. インフラデータがあれば → インポートUI でアップロード
4. インフラデータがなければ → 現場オペレーターがアプリで手入力
5. asset_types / attribute_definitions をカスタマイズ（任意）
```

## RLS（テナント分離）

```sql
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));
-- 全テーブルに同じパターンを適用
```

## 座標系の注意

日本の行政GISデータは複数の座標系が混在：
- EPSG:4326（WGS84）— GPS / 国際標準
- EPSG:6668（JGD2011 地理座標）— 国の基準
- EPSG:2443〜2461（JGD2011 平面直角座標系 1〜19系）— 自治体GISで多い

インポート時に自動検出 + 手動選択 → WGS84 (4326) に統一変換。

## なぜ MapLibre GL JS か
- **OSS** (BSD-3): Mapboxが商用化した後のコミュニティフォーク
- **トークン不要**: API Key なしで利用可能
- **ベクタータイル対応**: 国土地理院タイルとの親和性◎
- **PMTiles対応**: 静的ホスティングでサーバーレス配信

## なぜ ArcGIS を使わないか
- ライセンスコスト（年額数十万〜） → 差別化ポイント
- データロックイン
- モバイルUIが弱い（競合との差別化軸）
- カスタマイズの自由度が低い

## 想定コスト（MVP）
- Vercel: Hobbyプラン無料
- Supabase: Freeプラン（500MB DB / 1GB Storage）
- Cloudflare R2: 10GBまで無料、エグレス完全無料
- 国土地理院タイル: 無料
- **月額ランニングコスト: ほぼゼロ**
