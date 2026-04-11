#!/usr/bin/env node
/*
 * fetch_osm_roads.js
 * -----------------------------------------------------------------------
 * 伊丹市域の道路ネットワークを OSM (OpenStreetMap) から Overpass API 経由で
 * 取得し、国道 / 県道 / 市道 / 私道 の 4 分類に振り分けて GeoJSON で保存する。
 *
 * 出力先:
 *   data/osm/roads-kokudo.geojson
 *   data/osm/roads-kendo.geojson
 *   data/osm/roads-shido.geojson
 *   data/osm/roads-private.geojson
 *
 * 使い方:
 *   node scripts/fetch_osm_roads.js
 *
 * 前提:
 *   - Node.js 18 以上（グローバル fetch が利用可能であること）
 *   - ネットワーク接続
 *
 * データライセンス:
 *   © OpenStreetMap contributors (ODbL)
 *   利用時はアトリビューション表示が必要。
 * -----------------------------------------------------------------------
 */

const fs   = require('fs');
const path = require('path');

// Overpass QL クエリ
// 伊丹市の行政界（admin_level=7）内の highway を全取得する。
// area.itami は 伊丹市の行政境界ポリゴンを表す。
// （周辺市町の道路も一部まで含まないと arterial がぶつ切りになる場合があるが、
//   ここでは「市の管轄範囲」を厳密に可視化することを優先する）
const QUERY = `
[out:json][timeout:180];
area["name"="伊丹市"]["boundary"="administrative"]["admin_level"="7"]->.itami;
(
  way["highway"](area.itami);
);
out body geom;
`;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];

const OUT_DIR = path.join(__dirname, '..', 'data', 'osm');

// -----------------------------------------------------------------------
// 分類ロジック
// -----------------------------------------------------------------------
// OSM タグ → 4 分類
//   kokudo (国道)   : highway=trunk 系 / 名前に「国道」
//   kendo  (県道)   : highway=primary/secondary 系 / 名前に「県道/府道/都道/道道」
//   shido  (市道)   : highway=tertiary/residential/unclassified/living_street
//   private(私道)   : access が private/customers/permit 等
//                     もしくは highway=service かつ service=driveway/alley
// -----------------------------------------------------------------------
function classifyWay(tags) {
  const h      = tags.highway || '';
  const access = tags.access  || '';
  const name   = tags.name    || '';

  // --- 私道判定（最優先）---
  if (access === 'private' || access === 'no' || access === 'customers' || access === 'permit') {
    return 'private';
  }

  // --- 国道 ---
  if (h === 'motorway' || h === 'motorway_link' || h === 'trunk' || h === 'trunk_link') {
    return 'kokudo';
  }
  if (/国道/.test(name)) return 'kokudo';

  // --- 県道 ---
  if (h === 'primary' || h === 'primary_link' || h === 'secondary' || h === 'secondary_link') {
    return 'kendo';
  }
  if (/県道|府道|都道|道道/.test(name)) return 'kendo';

  // --- 市道 ---
  if (
    h === 'tertiary' ||
    h === 'tertiary_link' ||
    h === 'residential' ||
    h === 'unclassified' ||
    h === 'living_street'
  ) {
    return 'shido';
  }

  // --- service 道路 ---
  // service=driveway/alley は私道性が高い。それ以外（駐車場通路等）はスキップ
  if (h === 'service') {
    const s = tags.service || '';
    if (s === 'driveway' || s === 'alley') return 'private';
    return null;
  }

  // それ以外（footway/path/cycleway/steps 等）は対象外
  return null;
}

// Overpass way → GeoJSON Feature
function wayToFeature(way) {
  if (!way.geometry || !Array.isArray(way.geometry) || way.geometry.length < 2) {
    return null;
  }
  const coords = way.geometry.map(p => [p.lon, p.lat]);
  return {
    type: 'Feature',
    properties: {
      id:      way.id,
      name:    (way.tags && way.tags.name) || '',
      ref:     (way.tags && way.tags.ref)  || '',
      highway: (way.tags && way.tags.highway) || '',
      access:  (way.tags && way.tags.access)  || '',
      service: (way.tags && way.tags.service) || ''
    },
    geometry: { type: 'LineString', coordinates: coords }
  };
}

// Overpass API を複数エンドポイント × リトライで試す
const UA = 'civic-map-ops/0.1 (+https://github.com/h-koubou/civic-map-ops; contact: dev@h-koubou.example)';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function queryOverpass(query) {
  const attempts = [];
  for (let round = 0; round < 3; round++) {
    for (const url of OVERPASS_ENDPOINTS) {
      attempts.push({ url, round });
    }
  }

  let lastError = null;
  for (const { url, round } of attempts) {
    try {
      if (round > 0) await sleep(3000 * round);
      console.log('[overpass] POST', url, round > 0 ? `(retry ${round})` : '');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'Accept': 'application/json'
        },
        body: 'data=' + encodeURIComponent(query)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[overpass] failed:', url, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error('all overpass endpoints failed');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('[fetch_osm_roads] area = 伊丹市 (admin_level=7)');
  const data = await queryOverpass(QUERY);
  const elements = (data && data.elements) || [];
  console.log('[fetch_osm_roads] received', elements.length, 'elements');

  const groups = { kokudo: [], kendo: [], shido: [], private: [] };
  let skipped = 0;
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const cat = classifyWay(el.tags || {});
    if (!cat) { skipped++; continue; }
    const feat = wayToFeature(el);
    if (feat) groups[cat].push(feat);
  }

  for (const [k, features] of Object.entries(groups)) {
    const fc = { type: 'FeatureCollection', features };
    const out = path.join(OUT_DIR, `roads-${k}.geojson`);
    fs.writeFileSync(out, JSON.stringify(fc));
    console.log(`[fetch_osm_roads] ${String(features.length).padStart(5)} features → ${path.relative(path.join(__dirname, '..'), out)}`);
  }
  console.log(`[fetch_osm_roads] skipped ${skipped} non-road ways (footway/path/cycleway/service等)`);
  console.log('[fetch_osm_roads] done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
