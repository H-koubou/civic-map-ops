# OSM Road Data (Itami City)

伊丹市の行政界内にある道路ネットワークを OSM (OpenStreetMap) から
Overpass API 経由で取得し、業務分類 4 種に振り分けた GeoJSON。

## 生成方法

```bash
node scripts/fetch_osm_roads.js
```

`scripts/fetch_osm_roads.js` が以下のクエリを実行:

```overpass
[out:json][timeout:180];
area["name"="伊丹市"]["boundary"="administrative"]["admin_level"="7"]->.itami;
(
  way["highway"](area.itami);
);
out body geom;
```

## 分類ルール

| ファイル | 対象 OSM タグ |
|---|---|
| `roads-kokudo.geojson`  | `highway=motorway/trunk` もしくは `name` に「国道」を含む |
| `roads-kendo.geojson`   | `highway=primary/secondary` もしくは `name` に「県道/府道/都道/道道」を含む |
| `roads-shido.geojson`   | `highway=tertiary/residential/unclassified/living_street` |
| `roads-private.geojson` | `access=private/no/customers/permit` もしくは `highway=service` かつ `service=driveway/alley` |

`footway`, `cycleway`, `path`, `steps`, `service=parking_aisle` などは対象外。

## データライセンス

**© OpenStreetMap contributors** (ODbL)

地図表示時に以下のアトリビューションを必須とする:

> © OpenStreetMap contributors

参考: <https://www.openstreetmap.org/copyright>

## 更新頻度

OSM データは随時更新されるため、半年〜1年に一度の再取得を想定。
業務運用が開始されたら PMTiles 化して配信することを推奨。
