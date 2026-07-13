# BIツール Webアプリ 仕様書（改訂版 v2）

> Claude Code での実装を前提とした設計仕様。各フェーズは独立して着手できるよう分解してある。

---

## 0. 改訂履歴 / レビュー対応

v2 はレビュー指摘 A〜T を反映した改訂版。主な変更:

| ID | 指摘 | 対応 |
|----|------|------|
| A | DataSource が Dashboard 従属で再利用不可 | DataSource を User 直下のトップレベル資産化。Widget から多対一で参照（§8） |
| B | サーバーレスでキャッシュが揮発 | 共有キャッシュを Upstash Redis に明示統一（§5 FR-1, §7a） |
| C | 公開シート前提と認証の不整合 | OAuth 増分認可で本人のプライベートシートを読む方式を主、公開/gviz をフォールバックに（§5 FR-1） |
| D | PDF デプロイ方式が未確定 | Phase 0 で確定。既定: Vercel + `@sparticuz/chromium`、大規模時はコンテナ分離（§3, §11リスク） |
| E | テナント/共有モデルが未定義 | 「テナント」語を削除。v1 は所有者スコープ（共有なし）。Organization は将来拡張に明記（§5 FR-6） |
| F | 集計の実行場所が未定義 | サーバー側集計を正式化。group-by/フィルタ/ソートを query レイヤーに定義（§5 FR-2） |
| G | 型推論が脆い | 列型の手動オーバーライドを追加、推論はデフォルト値に（§5 FR-1） |
| H | middleware で DB 認可は不可 | middleware は認証のみ。認可は Route Handler/Server Action 側に明記（§7） |
| I | PDF トークンを query で渡すのは脆弱 | ヘッダ渡し + 単回使用(jti) + user/dashboard 束縛 + 印刷ルート no-store（§5 FR-5） |
| J | Playwright の描画完了待ち未定義 | ECharts `finished` で ready フラグ、Playwright が待機（§5 FR-5） |
| K | キャッシュミス時の thundering herd | Redis ロックで single-flight 化（§7a） |
| L | layouts(JSON) と Widget の整合 | Widget 削除時にレイアウト項目を同期削除するルールを定義（§5 FR-4） |
| M | スキーマと FR-1 の不一致 | `range` に統一（sheet 名も range 表記に含める）（§5 FR-1, §8） |
| N | テスト戦略なし | テスト方針を追加（§13） |
| O | 観測性なし | Sentry・構造化ログ・認証監査ログを追加（§6, §7） |
| P | a11y と ECharts canvas の矛盾 | SVG レンダラ採用 + データテーブル併設（§5 FR-2, §6） |
| Q | i18n | `next-intl` を Phase 0 から導入（§3, §14） |
| R | Widget.config 検証 | Zod discriminated union + config スキーマ版管理（§5 FR-2, §8） |
| S | CSP と ECharts/shadcn | nonce 戦略 + SVG レンダラで inline 回避、印刷ルートで検証（§7） |
| T | 依存固定 | 安定版確認とバージョンピン留め（§3） |

### 0.1 v3 追補（差分レビュー反映）

v2 に対する差分レビューの残課題を反映。

| ID | 指摘 | 対応 |
|----|------|------|
| 2-1 | OAuth リフレッシュトークンのライフサイクル未定義 | `access_type=offline` 取得・サーバー側リフレッシュ・revoke 検知 → 再認可要状態を定義（§5 FR-1） |
| 2-2 | User 削除時の FK カスケード矛盾 | `Widget.dataSource` を `SetNull` に変更。直接削除の保護はアプリ層の使用中チェックで担保（§8） |
| 2-3 | Playwright + chromium のサイズ/互換 | Phase 0 で実機検証。`puppeteer-core` 代替・250MB 上限確認を明記（§11, §14） |
| 2-4 | OAuth sensitive スコープ審査リードタイム | リリース計画に審査期間を織り込み、検証は test users(〜100) で（§16a） |
| 3-1 | CSP `style-src` が楽観的 | `script-src` は nonce 厳格、`style-src` は hash/`unsafe-inline` の現実解を許容し実機検証（§7） |
| 3-2 | サーバー集計でも全件取得は残る | range での行・列絞りを引き続き前提に（§5 FR-2） |
| 3-3 | `finished` 待ちはアニメ無効が前提 | 印刷モードで ECharts `animation: false`（§5 FR-5） |
| 3-4 | jti/ロックの保管・TTL 未定義 | jti は Redis 保管、ロック TTL・待機側タイムアウト・デッドロック回避を定義（§7a） |
| 3-5 | `/refresh` のレート制限 | データソース単位のレート制限を追加（§7, §9） |

---

## 1. 概要

Google スプレッドシートのデータを読み込み、多彩なグラフで可視化し、ドラッグ&ドロップで
自由にレイアウトできるダッシュボードを構築。PDF 出力に対応した、認証付きの Web アプリケーションを開発する。

### 1.1 前提条件

| 項目 | 決定内容 |
|------|----------|
| 提供形態 | Web サイト（デプロイして URL で提供） |
| 利用者 | 認証ログインしたユーザー（所有者スコープ） |
| データソース | 主: OAuth 増分認可で読む本人のプライベートシート / 副: 公開シート（gviz） |
| 技術スタック | おまかせ（下記の推奨構成を採用） |

---

## 2. スコープ

### 含む
- Google スプレッドシートからのデータ取得・正規化・サーバー集計・共有キャッシュ
- 複数種類のグラフ描画
- 再利用可能なデータソース管理（トップレベル資産）
- ダッシュボードの作成・一覧・編集・削除
- グリッドベースの自由レイアウト（ドラッグ&リサイズ）
- ダッシュボードの PDF 出力
- 認証・認可、セキュリティ対策、観測性

### 含まない（v1 スコープ外）
- スプレッドシートへの書き戻し（読み取り専用）
- リアルタイム双方向同期（手動更新 + TTL キャッシュで対応）
- 複雑な ETL パイプライン
- 複数ユーザー間の共有 / 組織（Organization）/ 公開リンク → 将来拡張（§16）

---

## 3. 技術スタック（推奨構成・バージョンはピン留め）

| レイヤー | 採用技術 | 理由 |
|----------|----------|------|
| フレームワーク | Next.js 15 (App Router) + TypeScript | フルスタック、Server Actions、デプロイ容易 |
| UI | Tailwind CSS + shadcn/ui | 一貫したデザインシステム |
| グラフ | Apache ECharts（**SVG レンダラ**, `echarts-for-react`） | 種類が豊富。SVG で a11y/CSP/PDF 再現性を確保 |
| レイアウト | `react-grid-layout` | ドラッグ&リサイズ、レスポンシブ、JSON 化 |
| データ取得(client) | TanStack Query | キャッシュ・再取得管理 |
| 共有キャッシュ | Upstash Redis | サーバーレスで揮発しない共有キャッシュ + ロック + レート制限を一元化 |
| DB | PostgreSQL (Neon / Supabase) | サーバーレス対応 |
| ORM | Prisma（Auth.js Adapter 併用） | 型安全・トークン永続化 |
| 認証 | Auth.js v5（**安定版を確認しピン留め**）+ Google OAuth | Google 連携・増分認可 |
| 検証 | Zod | 入力・config の境界検証 |
| i18n | `next-intl` | Phase 0 から導入 |
| 観測性 | Sentry + 構造化ログ | エラートラッキング・監査 |
| PDF | Playwright (Chromium) | グラフ含む高再現 PDF |
| デプロイ | **既定: Vercel + `@sparticuz/chromium`**（PDF 関数用）。大規模時は PDF をコンテナ分離 | §11 リスク参照 |

---

## 4. システム構成

```
[ブラウザ] ──認証セッション(HttpOnly Cookie)──►
[Next.js (App Router)]
  ├─ middleware: 認証(セッション有無)のみ。認可はしない
  ├─ Route Handlers / Server Actions: 所有権・ロール認可をここで実施
  │   ├─ /api/datasources/:id/data ─► [Upstash Redis] ⇄(miss/lock)─► [Google Sheets]
  │   │        └ OAuth: ユーザートークン / 公開: gviz(フォールバック)
  │   ├─ /api/dashboards/*          ─► [PostgreSQL] (Prisma)
  │   └─ /api/dashboards/:id/export ─► [Playwright] ─(header token)─► /dashboards/:id/print
  └─ client: ECharts(SVG) + react-grid-layout
```

原則:
- Sheets アクセスは必ずサーバー側。OAuth トークン・キーをブラウザに露出しない。
- 取得・集計結果は Upstash Redis で共有キャッシュ。手動更新でキー破棄。

---

## 5. 機能要件

### FR-1: Google スプレッドシート連携（データソース）

- **データソースはトップレベル資産**（User 所有）。複数ダッシュボード/ウィジェットから再利用される。
- 取得方式:
  1. **主: OAuth 増分認可**。ログイン後、必要時に `spreadsheets.readonly` スコープを増分付与し、
     **ユーザー自身のトークンで本人のプライベートシートを読む**。Sheets API v4 を使用。
  2. **副(フォールバック): 公開シート**。gviz CSV エンドポイントでサーバー側取得。
  - データソースは `authMode`（`OAUTH` / `PUBLIC`）を保持。
- **OAuth トークンのライフサイクル（重要・2-1 対応）**:
  - 認可は `access_type=offline`（初回や再同意が要る場合は `prompt=consent`）で**リフレッシュトークンを取得**し、サーバーで永続化（暗号化保存）。
  - アクセストークンは約 1 時間で失効するため、キャッシュ失効後の再取得・PDF 生成など**ユーザー不在の場面でもサーバーがリフレッシュ**して本人シートを読む。
  - revoke / 失効取り消しを検知したら、当該データソースを **「再認可が必要」状態**にし、UI から再認可へ誘導。バックグラウンド取得が静かに失敗しないようにする。
- 設定項目: `spreadsheetId`（URL から自動抽出）、`range`（例 `Sheet1!A1:F100`。シート名のみも可）、`refreshIntervalSec`（既定 300）。
- 正規化: 1 行目をヘッダー、列ごとに型推論（number/date/string）。空行・余白トリム。
- **列型の手動オーバーライド**を登録 UI に用意（推論はデフォルト値に留める。ロケール/桁区切り/通貨/%/TZ の揺れに対応）。
- 登録時にプレビュー（先頭 N 行）で列マッピングと型を確認。

### FR-2: データクエリと可視化

- **集計はサーバー側で確定**する（大規模データ・一貫性のため）。データソースに対し以下を定義した `query` を適用:
  - ディメンション（group-by）、メジャー（sum/avg/count/min/max）、フィルタ、ソート、limit。
  - 結果はキャッシュキーに `query` ハッシュを含めて保存。
  - 注（3-2）: 集計はクライアント転送量を減らすが、**Google からは range 全体を取得**するため関数メモリを圧迫し得る。巨大シートでは **range での行・列絞り**を引き続き前提とする。
- 可視化: ECharts（**SVG レンダラ**）共通ラッパー。初期対応:
  - 折れ線 / 棒（縦・横・積み上げ）/ 面 / 円・ドーナツ
  - 散布図 / バブル / レーダー / ヒートマップ / ゲージ / ツリーマップ / ファネル / KPI カード
- Widget の保存形を 2 層に分離:
  - `query`(JSON): データ整形（上記）
  - `config`(JSON): 見た目（軸・系列マッピング、配色テーマ、凡例/ラベル表示）
- **`config` は Zod の discriminated union（チャート種別ごと）で検証**。`schemaVersion` を持たせマイグレーション方針を定義。
- a11y: チャートに `aria` を付与し、**データテーブルを併設**（SR/PDF/コピー用途）。

### FR-3: ダッシュボード一覧
- ログイン後トップにカード一覧（タイトル・説明・更新日時・開く/複製/削除）。
- 新規作成で空ダッシュボードを生成。

### FR-4: 自由レイアウト
- `react-grid-layout` でグリッド配置、ドラッグ移動・リサイズ。
- 編集/閲覧モード切替。lg/md/sm ブレークポイント別レイアウトを保持。
- レイアウトは Dashboard に JSON 永続化。
- **整合性ルール**: レイアウト項目 `i` は Widget.id と一致させる。Widget 追加で未配置項目を補完、
  **Widget 削除時は対応するレイアウト項目もトランザクション内で削除**（孤立/未配置を作らない）。

### FR-5: PDF 出力
- 主方式: サーバー側 Playwright が印刷最適化ルート `/dashboards/:id/print` を開いて PDF 化。
  - 認可: **単回使用(jti)・短命・{userId, dashboardId} に束縛した署名トークン**を発行し、
    **HTTP ヘッダ（`extraHTTPHeaders`）で渡す**（query には載せない）。印刷ルートはトークン検証 + `Cache-Control: no-store`。
  - **描画完了待ち**: 各 ECharts の `finished` イベントで `window.__chartsReady` を立て、Playwright が `waitForFunction` で待機してからキャプチャ。**印刷モードでは `animation: false`** にする（アニメ有効だと `finished` の発火が非決定的になり待機が不安定になるため。3-3 対応）。
  - 用紙サイズ（A4/A3）・向き（縦/横）を指定可能。出力に名称・生成日時を含める。
- フォールバック: `@media print` の印刷用 CSS。

### FR-6: 認証・認可（v1 = 所有者スコープ）
- Auth.js v5 + Google OAuth でログイン。Prisma Adapter でアカウント/トークン永続化。増分スコープ対応。
- **middleware は認証（セッション有無）のみ**を判定。
- **所有権・ロールの認可は Route Handler / Server Action 側**で必ず実施（対象リソースの ownerId 照合）。
- v1 はダッシュボード/データソースとも**所有者のみアクセス可**。クロスユーザー共有・組織は将来拡張（§16）。
- `role`(VIEWER/EDITOR/ADMIN) は将来の権限拡張・運用管理用に保持。

---

## 6. 非機能要件
- パフォーマンス: キャッシュヒット時 LCP < 2.5s。大規模データは列・行を絞り、サーバー集計で転送量削減。
- 可用性: ステートレスなアプリ層 + マネージド DB / Redis。
- 観測性: Sentry によるエラートラッキング、構造化ログ、主要メトリクス。**認証イベントの監査ログは v1 から**。
- アクセシビリティ: ECharts は SVG レンダラ + aria + データテーブル併設。コントラスト・キーボード操作に配慮。
- 国際化: `next-intl`。初期は日本語、拡張可能。
- 保守性: 機能ごとのモジュール分割、Zod による境界検証、型安全。

---

## 7. セキュリティ設計

| 対策 | 内容 |
|------|------|
| 認証 | Auth.js、HttpOnly + Secure + SameSite=Lax Cookie セッション |
| 認可 | **middleware=認証のみ**。所有権/ロールは Route Handler/Server Action で検証 |
| 秘匿情報 | OAuth トークン・キー・DB/Redis 接続情報は環境変数。クライアント非送出 |
| データ取得 | Sheets はサーバー経由のみ。OAuth トークンはサーバー保管 |
| 入力検証 | 全 API 入力を Zod 検証。`spreadsheetId`/`range`/`query`/`config` の形式チェック |
| CSRF | Server Actions の組み込み保護 + SameSite Cookie |
| セキュリティヘッダー | CSP は **`script-src` を nonce で厳格化**。`style-src` は SVG/Tailwind/shadcn がインライン style を要するため **hash または `unsafe-inline` を現実解として許容**し、実機で印刷ルート含め非破綻を検証（3-1 対応）。+ HSTS + X-Frame-Options + X-Content-Type-Options |
| レート制限 | Upstash Ratelimit。取得・エクスポートに加え **`/api/datasources/:id/refresh` をデータソース単位で制限**（Google への連打防止。3-5 対応） |
| PDF トークン | 単回使用(jti)・短命・user/dashboard 束縛・ヘッダ渡し・印刷ルート no-store |
| 監査 | 認証成功/失敗・エクスポートを監査ログに記録 |
| 依存関係 | バージョンピン留め、CI で `npm audit`、最小権限の DB ロール |

### 7a. キャッシュ設計（Upstash Redis）
- キー: `ds:{dataSourceId}:{queryHash}`。値は集計済みデータ + 取得時刻。
- TTL = データソースの `refreshIntervalSec`。
- **single-flight**: キャッシュミス時は `lock:ds:{dataSourceId}:{queryHash}` で排他取得し、thundering herd を防止。待機側はロック解放後にキャッシュ参照。
- **ロック/トークンの規定（3-4 対応）**:
  - ロックは Redis に短い TTL（例 10〜30 秒）付きで取得し、保持プロセスが死んでも自動失効させデッドロックを回避。待機側にもタイムアウトを設け、超過時はエラー応答。
  - PDF の単回使用 `jti` は Redis に保管（`used:jti:{id}`、TTL = トークン有効期限）。検証時に存在/未使用を確認し、使用後に消費済みへ更新。
- 手動更新ボタンは該当キーを破棄して再取得。
- レート制限と連携し、Google への呼び出し回数を保護。

---

## 8. データモデル（Prisma スキーマ概要）

```prisma
model User {
  id          String       @id @default(cuid())
  email       String       @unique
  name        String?
  image       String?
  role        Role         @default(EDITOR)
  dataSources DataSource[]                  // トップレベル資産として所有
  dashboards  Dashboard[]
  createdAt   DateTime     @default(now())
  // Auth.js: accounts / sessions は Adapter が管理（OAuth トークン永続化）
}

enum Role { VIEWER EDITOR ADMIN }
enum AuthMode { OAUTH PUBLIC }

model DataSource {
  id                 String   @id @default(cuid())
  ownerId            String
  owner              User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name               String
  spreadsheetId      String
  range              String                       // 例 "Sheet1!A1:F100"（シート名のみも可）
  authMode           AuthMode @default(OAUTH)
  columnTypes        Json?                         // 列型の手動オーバーライド
  refreshIntervalSec Int      @default(300)
  widgets            Widget[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model Dashboard {
  id          String   @id @default(cuid())
  title       String
  description String?
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  layouts     Json                                 // RGL のブレークポイント別レイアウト
  widgets     Widget[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Widget {
  id           String      @id @default(cuid())
  dashboardId  String
  dashboard    Dashboard   @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
  dataSourceId String?
  // FK は SetNull（2-2: User 削除時のカスケードと Restrict の競合で削除が失敗するのを回避）。
  // 「使用中のデータソースは直接削除不可」の保護はアプリ層の使用中チェックで担保する。
  dataSource   DataSource? @relation(fields: [dataSourceId], references: [id], onDelete: SetNull)
  type         String                              // "line" | "bar" | "pie" | "kpi" ...
  title        String?
  query        Json                                // group-by / measure / filter / sort / limit
  config       Json                                // チャート見た目（schemaVersion 付き）
}
```

注: DataSource は Dashboard に従属しない（A 対応）。Widget 経由で多数のダッシュボードから再利用される。

削除ポリシー（2-2 対応）:
- データソースの**直接削除**は、参照中の Widget があればアプリ層で拒否（使用中チェック）。付け替え/解除を促す。
- **アカウント削除**は「Widget → Dashboard → DataSource」の順序付きトランザクションで処理。`Widget.dataSource` が `SetNull` なので FK 競合で失敗しない。

---

## 9. API 設計

| メソッド | パス | 説明 |
|----------|------|------|
| `*` | `/api/auth/*` | Auth.js ハンドラ（増分スコープ含む） |
| GET/POST | `/api/datasources` | データソース一覧 / 登録（接続検証込み） |
| GET/PATCH/DELETE | `/api/datasources/:id` | 取得 / 更新 / 削除（使用中はアプリ層で拒否） |
| GET | `/api/datasources/:id/data` | 集計データ取得（query 適用・Redis キャッシュ・single-flight） |
| POST | `/api/datasources/:id/refresh` | キャッシュ破棄して再取得（**データソース単位でレート制限**） |
| GET/POST | `/api/dashboards` | 一覧 / 新規作成 |
| GET/PATCH/DELETE | `/api/dashboards/:id` | 取得 / 更新(レイアウト含む) / 削除 |
| POST/PATCH/DELETE | `/api/dashboards/:id/widgets` | ウィジェット CRUD（削除時レイアウト同期） |
| POST | `/api/dashboards/:id/export` | PDF 生成（Playwright + ヘッダトークン） |
| GET | `/dashboards/:id/print` | 印刷ビュー（トークン検証・no-store） |

全保護ルートで「ログイン済み」かつ「対象リソースの owner 一致」を Route Handler/Server Action で検証。

---

## 10. 画面構成
1. ログイン（Google）
2. ダッシュボード一覧
3. データソース管理（登録・プレビュー・列型上書き・再取得）
4. ダッシュボード編集（左: ウィジェット/データソース、中央: グリッド、右: 設定、上部: モード切替/保存/更新/PDF）
5. 印刷ビュー `/dashboards/:id/print`（装飾排除・出力専用）

---

## 11. ディレクトリ構成（目安）

```
src/
├── app/
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── dashboards/{page, [id]/page, [id]/print/page}
│   │   └── datasources/page
│   └── api/{auth, dashboards, datasources}/
├── components/{charts, dashboard, ui}/
├── lib/
│   ├── sheets/     # OAuth/公開 取得・正規化・集計
│   ├── cache/      # Upstash Redis・ロック
│   ├── auth/       # Auth.js 設定・増分スコープ
│   ├── pdf/        # Playwright エクスポート
│   ├── query/      # query スキーマ・適用ロジック
│   └── db/         # Prisma
├── i18n/           # next-intl
└── middleware.ts   # 認証ガード・セキュリティヘッダー
```

### デプロイ/PDF のリスク（D / 2-3 対応の確定事項）
- 既定: Vercel にアプリをデプロイし、PDF 関数で `@sparticuz/chromium` を使用。
- **Phase 0 で実機検証する（2-3）**:
  - `@sparticuz/chromium` は `puppeteer-core` との組み合わせが定番で **Playwright 併用は実績が少ない**。動作しなければ `puppeteer-core` 採用も選択肢。
  - Next.js + Chromium は **Vercel 関数バンドルの 250MB 上限**に接近しやすい。サイズ/コールドスタート/タイムアウトを計測。
- 上記が厳しければ **PDF 生成を別コンテナ（Render/Fly/Railway）に分離**できるよう、PDF レイヤーはインターフェースで疎結合化しておく。

---

## 12. 環境変数

```
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_URL=                 # 印刷ルートへの内部アクセス用
EXPORT_TOKEN_SECRET=     # PDF 署名トークンの署名鍵
SENTRY_DSN=
# 公開シートのみフォールバック利用する場合の任意キー
GOOGLE_SHEETS_API_KEY=
```

---

## 13. テスト戦略

- 単体: query 適用・型推論/上書き・config の Zod 検証・キャッシュキー生成。
- 結合: Sheets 取得（OAuth/公開のモック）、single-flight、認可（owner 不一致で 403）。
- E2E（Playwright）: ログイン → データソース登録 → チャート作成 → レイアウト保存 → PDF 出力。
- セキュリティ: 未認証アクセスのリダイレクト、トークン単回使用・失効、CSP 非破綻、レート制限。

---

## 14. 実装フェーズ（Claude Code 向け）

### Phase 0: 基盤 + 横断決定
- Next.js 15 + TS + Tailwind + shadcn/ui、`next-intl`、Sentry、Prisma + Postgres、Upstash Redis 接続
- Auth.js v5 + Google OAuth（増分スコープ準備、**`access_type=offline` でリフレッシュトークン取得**）、middleware は認証のみ
- **PDF デプロイ方式を実機検証して確定**（既定 Vercel + `@sparticuz/chromium`。Playwright 互換・250MB 上限を計測、不可なら `puppeteer-core` か別コンテナ）
- 完了条件: ログイン → 空のダッシュボード一覧表示、Redis 疎通、PDF 経路の最小動作確認

### Phase 1: データレイヤー
- データソース（トップレベル）登録 UI、URL から `spreadsheetId` 抽出
- OAuth 取得（主）+ 公開 gviz（副）、正規化・型推論・**列型上書き**
- **トークンのサーバー側リフレッシュ + revoke 検知 → 「再認可が必要」状態と再認可導線**
- **アカウント削除/データソース削除のポリシー実装**（使用中チェック・順序付きトランザクション）
- query（group-by/measure/filter/sort）適用のサーバー集計、Redis キャッシュ + single-flight（ロック TTL・待機タイムアウト）、`/refresh`（レート制限付き）
- プレビューテーブル
- 完了条件: シート登録 → 集計確認、キャッシュ/再取得が機能、トークン失効後も自動再取得できる

### Phase 2: 可視化
- ECharts(SVG) 共通ラッパー、§FR-2 のチャート、マッピング UI、配色テーマ
- `config` の Zod discriminated union 検証、データテーブル併設(a11y)
- 完了条件: 任意のチャートを描画・設定、再読込後も保持

### Phase 3: ダッシュボード & レイアウト
- ダッシュボード CRUD、RGL でドラッグ&リサイズ、レイアウト永続化
- Widget 削除時のレイアウト同期
- 完了条件: 自由配置が再読込後も維持、孤立レイアウトが出ない

### Phase 4: PDF 出力
- 印刷ルート + 単回使用ヘッダトークン、Playwright + 描画完了待ち
- 用紙サイズ/向き
- 完了条件: グラフ込みで PDF 出力、トークンが単回・失効

### Phase 5: セキュリティ強化と仕上げ
- nonce CSP / 各種ヘッダ / レート制限 / 監査ログ / 認可網羅
- 観測性・エラーハンドリング・パフォーマンス調整
- 完了条件: §7 の全項目・§13 のテストが通過

---

## 15. 受け入れ基準（抜粋）
- [ ] 未ログインで保護ルートへアクセスするとログインへリダイレクトされる
- [ ] OAuth で本人のプライベートシートを取得でき、公開シートもフォールバックで取得できる
- [ ] OAuth トークン/キーがブラウザのバンドル・ネットワークに露出しない
- [ ] データソースを複数ダッシュボードで再利用でき、ダッシュボード削除で消えない
- [ ] キャッシュが共有され、同時アクセスでも Sheets 取得が 1 回に集約される
- [ ] 最低 5 種類のチャートを描画でき、設定が再読込後も保持される
- [ ] ウィジェット削除でレイアウトに孤立項目が残らない
- [ ] グラフ込みで PDF 出力でき、描画途中の欠けが起きない
- [ ] エクスポートトークンが単回使用かつ短時間で失効する
- [ ] アクセストークン失効後もサーバーが自動リフレッシュして取得でき、revoke 時は再認可導線が出る
- [ ] 使用中データソースは直接削除できず、アカウント削除は FK 競合せず完了する
- [ ] 他ユーザーのリソースへアクセスすると 403 になる

---

## 16. リリース計画上の留意（2-4 対応）

- `spreadsheets.readonly` は Google の **sensitive スコープ**。本番公開・100 ユーザー超では **Google のアプリ審査が必要で、数週間かかることがある**。リリース計画にこのリードタイムを織り込む。
- 検証段階は **test users（〜100 人）登録**で審査前でも進められる。早期に OAuth 同意画面の設定・審査申請を開始しておく。

---

## 17. 将来拡張
- 組織（Organization/Workspace）+ メンバーシップによる共有・公開リンク
- スケジュール配信（定期 PDF メール）
- 複数データソースの結合
- テーマ拡充・ダークモード
- 監査ログの拡張（操作全般）
