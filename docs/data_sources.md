# データソース一覧

## 1. 伊丹市オープンデータ（G空間情報センター）
- **URL**: https://www.geospatial.jp/ckan/organization/hyogo-itami
- **データセット数**: 61件（2026-04時点）
- **ライセンス**: CC BY 4.0
- **主な形式**: CSV中心、Shapefileは「地番参考図」のみ
- **確認済データセット例**:
  - 令和７年度 伊丹市地番参考図（Shapefile, ZIP）
  - 人口統計（町別・年齢別） CSV
  - 医療機関一覧 CSV
  - 公共施設情報（図書館、AED） CSV
  - 安全・安心見守りカメラ一覧 CSV
  - 消防局管轄区域一覧 CSV
- **要追加調査**: 残40件のデータセット詳細

## 2. 伊丹市公開型GIS「たみまっぷ」
- **URL**: https://itami.maps.arcgis.com/home/index.html
- **基盤**: ArcGIS Online
- **公開されているもの**:
  - 下水道（分流地区の汚水管・合流管のみ）
  - 都市計画情報
  - 指定道路情報
- **データ取得可否**: ArcGIS REST API経由で取得できる可能性あり（要検証）
- **二次利用**: 利用規約PDFを要確認

## 3. 都市計画情報マップ
- **URL**: https://itami-map.alandis.jp/portal/apps/webappviewer/index.html?id=fbc8e9d00a8d4ee08cccabdc10ef6c00
- **基盤**: ArcGIS WebAppViewer（株式会社アルプスマッピング系？）
- **要調査**: REST APIエンドポイントの存在

## 4. ゴミ収集ガイドブック
- **URL**: https://www.city.itami.lg.jp/material/files/group/26/gaidobook20240606.pdf
- **形式**: PDF
- **処理方針**: pdfplumber等でテーブル抽出→JSON化
- **抽出すべき情報**:
  - 地区別の収集曜日
  - ゴミ種別ごとの分別ルール
  - 五十音順「分別辞典」（あいうえお順の品目→分別カテゴリ）
  - 粗大ゴミ申込方法

## 5. 国土地理院（GSI）
- **ベクトルタイル**: https://maps.gsi.go.jp/development/vt.html
- **基盤地図情報**: https://www.gsi.go.jp/kiban/
  - 道路縁、建物、河川、行政界 等
  - Shapefileダウンロード可能
- **ジオコーディングAPI**: https://msearch.gsi.go.jp/address-search/AddressSearch
- **ライセンス**: 出典明示で利用可

## 6. 国土数値情報（MLIT）
- **URL**: https://nlftp.mlit.go.jp/ksj/index.html
- **取得可能データ**:
  - 廃棄物処理施設（全国） https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P15.html
  - 下水道関連施設
  - 公共施設
  - 用途地域
- **形式**: Shapefile / GeoJSON
- **ライセンス**: 国土数値情報利用規約

## 7. 兵庫県オープンデータカタログ
- **URL**: https://web.pref.hyogo.lg.jp/opendata/index.php
- **要調査**: 伊丹市域に関連するデータの有無

## 8. OpenStreetMap (OSM)
- **取得方法**: Overpass API / Geofabrik 兵庫県データ
- **取得可能**: 道路、建物、ランドユース
- **ライセンス**: ODbL（出典＋同条件継承）

## 9. e-Stat（政府統計）
- **URL**: https://www.e-stat.go.jp/
- **用途**: 人口統計、世帯数等で エリア別需要を可視化

## 取得困難なもの・要相談
- **市道側溝の正確な位置**: 道路台帳に存在するが公開されていない
  → 開示請求 or 市役所と直接連携が必要
- **下水道台帳全体（雨水管含む）**: 一般には閲覧申請制
  → 公開されている汚水・合流管のみで MVP は構成
- **個別の収集ルート・収集車の現在地**: 市の業務情報

## 取得スクリプト計画
```
scripts/
├── fetch_geospatial_jp.sh      # CKAN APIで伊丹市データ全取得
├── fetch_gsi_kiban.sh          # 国土地理院基盤地図情報
├── fetch_mlit_p15.sh           # 全国廃棄物処理施設→兵庫県＋伊丹市抽出
├── fetch_osm_itami.sh          # Overpass APIで伊丹市域抽出
├── parse_gomi_pdf.py           # ゴミ収集ガイドPDFパース
├── convert_to_geojson.py       # 一括GeoJSON化
└── build_pmtiles.sh            # tippecanoeでPMTiles生成
```
