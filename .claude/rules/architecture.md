# アーキテクチャ・コンポーネント設計ルール

## ディレクトリ構成（仕様書 §11 準拠）

```
src/
├── app/
│   ├── (auth)/login/
│   ├── (app)/{dashboards, datasources}/
│   └── api/{auth, dashboards, datasources}/
├── components/{charts, dashboard, ui}/
├── lib/{sheets, cache, auth, pdf, query, db}/
├── i18n/
└── middleware.ts
```

- 新規モジュールは上記の責務分割に沿って配置する。`lib/` 配下はレイヤー単位（取得・キャッシュ・認証・PDF・クエリ・DB）で
  完結させ、相互に直接依存させない（必要なら上位の Route Handler / Server Action で組み合わせる）。

## ファイルサイズ・コンポーネント分離

- 1 ファイルはおよそ 300 行を目安に分割する。超える場合はロジック（hooks / lib 関数）と
  表示（コンポーネント）を分離する。
- React コンポーネントは「データ取得・状態管理」と「表示」を分離する
  （例: `DashboardEditor`（状態）と `WidgetGrid` / `WidgetCard`（表示) のように）。
- 冗長な繰り返し処理は早めに関数・hooks として切り出す（同じロジックを 3 箇所で書く前に共通化する）。

## レイヤー間の境界（仕様書 §4, §7 準拠）

- **middleware は認証（セッション有無）の判定のみ**。所有権・ロール認可を middleware に書かない。
- 所有権チェック（`ownerId` 照合）は Route Handler / Server Action 側で必ず行う。
- Google Sheets へのアクセス・OAuth トークンの扱いは必ずサーバー側（`lib/sheets/`）に閉じ込め、
  クライアントコンポーネントやクライアントに送出される props にトークン・キーを含めない。
- 集計（group-by / measure / filter / sort）はサーバー側 `lib/query/` で確定させる。クライアントは
  集計結果のみを受け取る。

## DB 設計

- スキーマは可能な限り正規化する（仕様書 §8 の Prisma スキーマを基準とする）。
- `DataSource` は User 直下のトップレベル資産。Dashboard や Widget に従属させない。
- リレーションの `onDelete` 方針は仕様書の削除ポリシー（§8 末尾）に従う
  （`Widget.dataSource` は `SetNull`、使用中データソースの直接削除はアプリ層で拒否）。

## レイアウト整合性

- `react-grid-layout` の `layouts` 項目 `i` は `Widget.id` と一致させる。Widget 削除時は
  対応するレイアウト項目をトランザクション内で同期削除し、孤立項目を作らない（仕様書 FR-4）。
