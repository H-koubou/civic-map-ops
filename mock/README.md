# 伊丹シビックマップ — HTMLモック

伊丹市自治体GISサービスのデザイン検証用 HTMLモック。
**Material Design 3** ベース、共通ヘッダー/フッターは `partials/` に集約。

## 起動方法
ローカルHTTPサーバーが必要（fetch でパーシャル読み込みのため）。

```bash
cd mock
python3 -m http.server 8000
# http://localhost:8000/ でアクセス
```

## 構成
```
mock/
├── index.html           # ホーム
├── map.html             # 地図メイン
├── gomi-search.html     # ゴミ分別検索
├── collection-day.html  # 収集日カレンダー
├── facilities.html      # 施設一覧
├── about.html           # サービス概要
├── partials/
│   ├── header.html      # 共通ヘッダー (TopAppBar + Drawer + BottomNav)
│   └── footer.html      # 共通フッター
├── css/
│   ├── tokens.css       # M3 デザイントークン (color/type/shape/elevation/motion)
│   ├── base.css         # リセット・タイポ・レイアウトプリミティブ
│   ├── components.css   # ボタン/カード/チップ/フィールド/Snackbar 等
│   └── layout.css       # TopAppBar/Drawer/BottomNav/Footer
└── js/
    ├── include.js       # data-include="..." でパーシャルを読込
    └── app.js           # ドロワー/テーマ/リップル/Snackbar 等の共通動作
```

## 共通パーシャルの使い方
各ページは下記のように記述するだけで、ヘッダー/フッターを共通読込できます。

```html
<body data-page="home">
  <div data-include="partials/header.html"></div>
  <main>...</main>
  <div data-include="partials/footer.html"></div>

  <script src="js/include.js"></script>
  <script src="js/app.js"></script>
</body>
```

`data-page` 属性は現在ページを示し、ナビゲーションの active 状態に使われます。
（home / map / gomi / collection / facilities / about）

## デザイン原則
- Material Design 3（Material You）
- ライト/ダーク自動切替（ヘッダー右上のトグル or システム設定）
- レスポンシブ（モバイルは BottomNav、デスクトップは TopAppBar Nav）
- アクセシビリティ（focus-visible、aria-label、reduced-motion 対応）
- リップルエフェクト、Snackbar、Dialog 完備
