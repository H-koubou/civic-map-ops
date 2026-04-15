# data/gsi/ — 国土地理院ベクトルタイル由来データ

## 出典
国土地理院 最適化ベクトルタイル（optimal_bvmap-v1）
https://github.com/gsi-cyberjapan/optimal_bvmap

測量法に基づく国土地理院の基本測量成果。利用時は出典明記が必要。

## 収録データ

| ファイル | 内容 | vt_rdctg |
|----------|------|----------|
| `roads-kokudo.geojson` | 国道・高速自動車国道等 | `国道` / `高速自動車国道等` |
| `roads-kendo.geojson` | 都道府県道 | `都道府県道` |
| `roads-shido.geojson` | 市区町村道等 | `市区町村道等` |

## 生成手順

```bash
npm install @mapbox/vector-tile pbf
node scripts/fetch_gsi_roads.js
```

## 対象範囲
伊丹市周辺（BBOX: 135.370~135.435 E, 34.750~34.810 N）
ズームレベル 16（最大詳細）で取得

## 座標精度
小数点以下6桁（約0.1m）

## 注意
- **私道は含まれない**（国の測量対象外）
- 座標系: EPSG:4326 (WGS84)
- 更新: 国土地理院が四半期ごとにタイルを更新
