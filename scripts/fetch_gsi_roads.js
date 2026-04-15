#!/usr/bin/env node
/*
 * fetch_gsi_roads.js
 * -----------------------------------------------------------------------
 * 国土地理院 最適化ベクトルタイル（optimal_bvmap-v1）から
 * 指定バウンディングボックス内の道路中心線（RdCL レイヤー）を抽出し、
 * 国道 / 県道 / 市道 の 3 分類 GeoJSON として保存する。
 *
 * 出力先:
 *   data/gsi/roads-kokudo.geojson   （国道＋高速道路）
 *   data/gsi/roads-kendo.geojson    （都道府県道）
 *   data/gsi/roads-shido.geojson    （市区町村道等）
 *
 * 使い方:
 *   node scripts/fetch_gsi_roads.js
 *
 * 前提:
 *   - Node.js 18 以上
 *   - npm install @mapbox/vector-tile pbf
 *
 * データ出典:
 *   国土地理院 最適化ベクトルタイル（ https://github.com/gsi-cyberjapan/optimal_bvmap ）
 *   測量法に基づく国土地理院の基本測量成果。出典明記で利用可。
 * -----------------------------------------------------------------------
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const Pbf  = require('pbf').default || require('pbf');
const { VectorTile } = require('@mapbox/vector-tile');

// -----------------------------------------------------------------------
// 設定
// -----------------------------------------------------------------------

// 伊丹市のバウンディングボックス（少し広めに取る）
const BBOX = {
  north: 34.810,
  south: 34.750,
  west:  135.370,
  east:  135.435
};

// 取得ズームレベル（16 = GSI 最大詳細、全道路が含まれる）
const ZOOM = 16;

// 同時リクエスト数（GSI サーバーに負荷をかけすぎない）
const CONCURRENCY = 4;

// 出力先
const OUT_DIR = path.join(__dirname, '..', 'data', 'gsi');

// タイル URL テンプレート
const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf';

// -----------------------------------------------------------------------
// タイル座標計算
// -----------------------------------------------------------------------
function lngToTileX(lng, z) {
  return Math.floor((lng + 180) / 360 * Math.pow(2, z));
}

function latToTileY(lat, z) {
  const rad = lat * Math.PI / 180;
  return Math.floor(
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z)
  );
}

function getTileRange(bbox, z) {
  return {
    xMin: lngToTileX(bbox.west, z),
    xMax: lngToTileX(bbox.east, z),
    yMin: latToTileY(bbox.north, z),  // north = smaller y
    yMax: latToTileY(bbox.south, z)
  };
}

// -----------------------------------------------------------------------
// HTTP fetch（Node 組み込み https のみ使用）
// -----------------------------------------------------------------------
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'civic-map-ops/0.1' } }, res => {
      if (res.statusCode === 404) {
        resolve(null); // 海域等でタイルが存在しない
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// -----------------------------------------------------------------------
// 分類ロジック
// -----------------------------------------------------------------------
// GSI vt_rdctg → 3 分類
function classifyRoad(props) {
  const rdctg = props.vt_rdctg || '';
  if (rdctg === '国道' || rdctg === '高速自動車国道等') return 'kokudo';
  if (rdctg === '都道府県道') return 'kendo';
  if (rdctg === '市区町村道等') return 'shido';
  return null; // 未分類（通常は発生しない）
}

// -----------------------------------------------------------------------
// 重複排除用キー生成
//   同じ道路セグメントが複数タイルに跨がる場合がある。
//   始点・終点の座標を丸めてキーにする。
// -----------------------------------------------------------------------
function featureKey(geometry) {
  const coords = geometry.type === 'MultiLineString'
    ? geometry.coordinates[0]
    : geometry.coordinates;
  if (!coords || coords.length < 2) return null;
  const s = coords[0];
  const e = coords[coords.length - 1];
  return s[0].toFixed(7) + ',' + s[1].toFixed(7) + '-' + e[0].toFixed(7) + ',' + e[1].toFixed(7);
}

// -----------------------------------------------------------------------
// メイン
// -----------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const range = getTileRange(BBOX, ZOOM);
  const totalTiles = (range.xMax - range.xMin + 1) * (range.yMax - range.yMin + 1);
  console.log(`[fetch_gsi_roads] zoom=${ZOOM}  tiles=${totalTiles}  x=${range.xMin}..${range.xMax}  y=${range.yMin}..${range.yMax}`);

  // タイル座標リストを作成
  const tasks = [];
  for (let x = range.xMin; x <= range.xMax; x++) {
    for (let y = range.yMin; y <= range.yMax; y++) {
      tasks.push({ x, y });
    }
  }

  // グループ別に Feature を蓄積（重複排除付き）
  const groups = { kokudo: [], kendo: [], shido: [] };
  const seen   = { kokudo: new Set(), kendo: new Set(), shido: new Set() };
  let fetched = 0;
  let errors  = 0;

  // 同時実行数制限付きで fetch
  async function processTile({ x, y }) {
    const url = TILE_URL.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
    try {
      const buf = await fetchBuffer(url);
      if (!buf) return;
      const tile = new VectorTile(new Pbf(buf));
      if (!tile.layers.RdCL) return;

      const layer = tile.layers.RdCL;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        const cls = classifyRoad(f.properties);
        if (!cls) continue;

        const geo = f.toGeoJSON(x, y, ZOOM);
        const key = featureKey(geo.geometry);
        if (key && seen[cls].has(key)) continue;
        if (key) seen[cls].add(key);

        // MultiLineString → 複数の LineString に分解
        const geometries = geo.geometry.type === 'MultiLineString'
          ? geo.geometry.coordinates.map(c => ({ type: 'LineString', coordinates: c }))
          : [geo.geometry];

        for (const geom of geometries) {
          if (geom.coordinates.length < 2) continue;
          // 座標を 6 桁（≒0.1m）に丸めてファイルサイズ削減
          const rounded = geom.coordinates.map(c => [
            Math.round(c[0] * 1e6) / 1e6,
            Math.round(c[1] * 1e6) / 1e6
          ]);
          groups[cls].push({
            type: 'Feature',
            properties: {
              rdctg:    f.properties.vt_rdctg,
              rnkwidth: f.properties.vt_rnkwidth || '',
              width:    f.properties.vt_width || 0
            },
            geometry: { type: 'LineString', coordinates: rounded }
          });
        }
      }
    } catch (err) {
      errors++;
      if (errors <= 5) console.warn(`  [warn] tile ${x}/${y}: ${err.message}`);
    }
    fetched++;
    if (fetched % 50 === 0 || fetched === totalTiles) {
      process.stdout.write(`\r  fetched ${fetched}/${totalTiles} tiles`);
    }
  }

  // 並列実行（セマフォ）
  let running = 0;
  let idx = 0;
  await new Promise((resolve) => {
    function next() {
      while (running < CONCURRENCY && idx < tasks.length) {
        running++;
        const task = tasks[idx++];
        processTile(task).then(() => {
          running--;
          if (idx >= tasks.length && running === 0) {
            resolve();
          } else {
            next();
          }
        });
      }
    }
    if (tasks.length === 0) resolve();
    else next();
  });

  console.log('');

  // GeoJSON 出力
  const labels = { kokudo: '国道', kendo: '県道', shido: '市道' };
  for (const [cls, features] of Object.entries(groups)) {
    const fc = {
      type: 'FeatureCollection',
      _metadata: {
        source: '国土地理院 最適化ベクトルタイル（optimal_bvmap-v1）',
        classification: labels[cls],
        zoom: ZOOM,
        bbox: [BBOX.west, BBOX.south, BBOX.east, BBOX.north],
        generated: new Date().toISOString()
      },
      features
    };
    const outPath = path.join(OUT_DIR, `roads-${cls}.geojson`);
    fs.writeFileSync(outPath, JSON.stringify(fc));
    const sizeMB = (Buffer.byteLength(JSON.stringify(fc)) / 1024 / 1024).toFixed(2);
    console.log(`  ${labels[cls].padEnd(4)} ${String(features.length).padStart(6)} features → ${path.relative(path.join(__dirname, '..'), outPath)}  (${sizeMB} MB)`);
  }

  if (errors > 0) console.warn(`  [warn] ${errors} tiles failed`);
  console.log('[fetch_gsi_roads] done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
