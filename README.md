# Civic Map Ops

> 自治体インフラ維持管理の現場業務を、タブレット1台で完結させるSaaS

紙/Excel運用で回っている**側溝清掃・下水道点検・施設点検**などの自治体現場業務を、
**地図 + カードUI + オフライン記録**で置き換えるためのプロダクトです。
最初のテナントは **伊丹市**、その後マルチテナントで全国の中規模自治体へ横展開する想定です。

## 🌐 公開モック

Material Design 3 ベースのモック（静的HTML）を GitHub Pages で公開しています。

**→ [https://h-koubou.github.io/civic-map-ops/](https://h-koubou.github.io/civic-map-ops/)**

モック画面一覧:
- `mock/index.html` — 業務ダッシュボード（KPI / ルート / アラート / 活動）
- `mock/map.html` — 地図（閲覧⇄記録モード切替・案件ピン・同期ステータス）
- `mock/tasks.html` — 案件一覧（フィルタ・テーブル・選択バー）
- `mock/inspect.html` — 現場記録フォーム（写真・チェック・状態評価・メモ・測定・位置情報）
- `mock/about.html` — プロダクト紹介

## 🎯 プロダクト概要

| | |
|---|---|
| **ターゲット** | 自治体職員 + 現場委託業者（清掃・点検・補修） |
| **利用シーン** | タブレットを持って現場へ、写真＋チェック＋GPS＋メモを一括記録 |
| **差別化軸** | 地図UXが圧倒的に良いこと（既存ArcGIS系は閲覧専用・モバイル弱い） |
| **対応前提** | マルチテナント（他自治体への横展開を想定） |

## ✨ モックの特徴

- **Material Design 3** ベースのトークン駆動デザイン（ライト/ダーク両対応）
- **タブレットファースト**: タッチターゲット48px以上
- **案件ステータスカラーコード**: 未着手 / 進行中 / 完了 / 要再訪
- **閲覧⇄記録モード切替**: 地図タップで新規案件ピン立て
- **オフライン前提のUI**: ローカル保存 → 同期ステータス表示
- **テナントラベル差替え**: ヘッダーに「伊丹市 環境インフラ台帳」などを表示

## 🛠 技術スタック（実装フェーズ）

モック段階は静的HTML/CSSですが、プロトタイプ以降は以下を想定しています。

- **Next.js 15** (App Router) + TypeScript
- **MapLibre GL JS** + 国土地理院ベクトルタイル
- **PMTiles** (Protomaps) による空間データ配信
- **Supabase** (PostGIS) + RLS でマルチテナント分離
- **PWA + IndexedDB** でオフライン記録
- **Vercel** + **Cloudflare R2**

## 📁 ディレクトリ構成

```
civic-map-ops/
├── CLAUDE.md          # Claude Code 用プロジェクトコンテキスト
├── README.md
├── index.html         # mock/index.html への遷移
├── docs/              # プロジェクト計画・調査メモ
│   ├── plan.md
│   ├── architecture.md
│   ├── data_sources.md
│   └── research.md
├── mock/              # Material 3 HTMLモック（公開対象）
│   ├── index.html
│   ├── map.html
│   ├── tasks.html
│   ├── inspect.html
│   ├── about.html
│   ├── css/
│   ├── js/
│   └── partials/
├── data/              # 空間データ作業用
├── scripts/           # データ取得・変換スクリプト
└── frontend/          # Next.js 実装（Phase 2 以降）
```

## 🚀 ローカルで動かす

```bash
cd mock
python3 -m http.server 8000
# http://localhost:8000/ をブラウザで開く
```

## 📝 ライセンス

現時点では非公開プロジェクト（All Rights Reserved）。
公開は営業デモ・フィードバック取得用途に限定します。
