# Sentry エラートラッキング導入 仕様書

## 概要

Kan. Sheets BI に Sentry によるエラートラッキングを導入し、`docs/bi-tool-spec.md` §6 / §7 が定める観測性要件を満たす。
現状は `src/lib/observability/logger.ts` の `captureServerException` が no-op であり、PDF 生成失敗・ウィジェットデータ取得失敗など本番環境での障害が検知できていない。
対象ユーザーは本サービスの運用者であり、ダッシュボードの問題を早期に把握して対処できるようにすることが目的である。

### 前提・制約

| 項目 | 決定内容 |
|------|----------|
| DSN 未設定時の動作 | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` が未設定（空または未定義）の場合、`@sentry/nextjs` を一切 import せず、Sentry を初期化しない。エラー送信は一切行われない。ローカル開発・テスト・E2E は DSN なしで従来どおり動作する。 |
| DSN の系統 | サーバー用: `SENTRY_DSN`、ブラウザ用: `NEXT_PUBLIC_SENTRY_DSN`（公開前提）の 2 系統。環境名（`SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`）とリリース識別子（`SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE`。コミット SHA 等）をイベントに付与できる。合計 6 変数を `.env.example` に記載する。 |
| 個人情報・秘密の送信禁止 | `@sentry/nextjs` v11 では `sendDefaultPii` オプションが型定義から削除されている。代わりに `beforeSend` フックで `scrubSentryEvent` を通し、Cookie・`Authorization`・`x-pdf-token` 等のヘッダー、ユーザーメール・IP、リクエストボディを除去する。 |
| パフォーマンストレース | `tracesSampleRate` は既定で 0（無効）。本仕様のスコープはエラートラッキングのみであり、Session Replay も使用しない。 |
| ビルド連携（`withSentryConfig`） | 本スプリントの対象外。DSN は未発行であり、ソースマップアップロードに必要な認証トークン・組織情報が揃っていないため、ビルドプラグインの設定は後続フェーズに委ねる。 |
| 既存テストへの影響 | `pnpm vitest run`（529 件以上）と `pnpm e2e`（31 件以上）が引き続きパスし、DSN 無しでは E2E が外部に接続しないこと。 |

---

## 機能一覧

### FEAT-SEN-001: Sentry 初期化（サーバー（Node.js）・ブラウザのエントリポイント）

- **優先度**: Must
- **説明**: `instrumentation.ts`（Node.js ランタイム限定）と Next.js のブラウザ向けエントリ（`instrumentation-client.ts`）を新設し、それぞれ DSN が設定されている場合にのみ Sentry を初期化する。Edge ランタイム（middleware）では初期化しない（理由: edge-instrumentation.js が 225 kB 超増えるため。詳細は「既知の制約 (f)」を参照）。環境名と各ランタイムのリリース識別子をオプションで付与できる。DSN が未設定の場合は `@sentry/nextjs` の import 自体をスキップし、後続のすべての Sentry 呼び出しが no-op になることを保証する。
- **受け入れ基準**:
  - [ ] `SENTRY_DSN` が未設定の状態で `pnpm build` および `pnpm vitest run` を実行してもエラーが発生しない
  - [ ] `SENTRY_DSN` が未設定の状態で `pnpm e2e` を実行しても外部ネットワークへの接続が発生しない（ネットワーク監視で確認可能）
  - [ ] `.env.example` に `SENTRY_DSN=`、`NEXT_PUBLIC_SENTRY_DSN=`、`SENTRY_ENVIRONMENT=`、`NEXT_PUBLIC_SENTRY_ENVIRONMENT=`、`SENTRY_RELEASE=`、`NEXT_PUBLIC_SENTRY_RELEASE=` の 6 項目が記載されている
  - [ ] `SENTRY_ENVIRONMENT` が設定されている場合、送信されるイベントの `environment` フィールドにその値が含まれる（統合テストで検証）
  - [ ] `SENTRY_RELEASE` が設定されている場合、送信されるイベントの `release` フィールドにその値が含まれる（統合テストで検証）

### FEAT-SEN-002: サーバー側の未処理例外の自動捕捉

- **優先度**: Must
- **説明**: Next.js の `onRequestError` フックを `instrumentation.ts` に実装し、Route Handler・Server Component・Server Action で発生した未処理例外を自動的に Sentry へ送信する。個人情報フィルタリング（後述 FEAT-SEN-004）を経由した後に送信する。
- **受け入れ基準**:
  - [ ] `instrumentation.ts` が `onRequestError` をエクスポートしている。DSN を設定（ローカル受信サーバー向け）した統合テストで、`onRequestError` にエラーとリクエスト情報（パス・メソッド・ヘッダー）を直接渡すと、`new Error("test server error")` のイベントがローカル受信サーバーに届く（Next 本体を起動せずに、Sentry の送信経路とフィルタを含めて検証する）
  - [ ] 上のテストで、リクエスト情報に `cookie`・`authorization`・`x-pdf-token` ヘッダーを含めて渡しても、届いたイベントにそれらが含まれない
  - [ ] `@sentry/nextjs` v11 では `sendDefaultPii` が型定義にないため、`beforeSend` フックで PII を除去している（`scrubSentryEvent` が `beforeSend` に設定されていることをコードレビューで確認）

### FEAT-SEN-003: ブラウザエラー境界での捕捉（`error.tsx` / `global-error.tsx`）

- **優先度**: Must
- **説明**: `src/app/(app)/error.tsx` を `console.error(error)` のみから Sentry への送信を追加する形に更新し、`src/app/global-error.tsx` を新設して同様に設定する。いずれも DSN が未設定の場合は Sentry 送信を行わず、既存の `console.error` ログは維持する。
- **受け入れ基準**:
  - [ ] `src/app/global-error.tsx` ファイルが存在し、エラー情報を Sentry へ送信するロジックを含む
  - [ ] `src/app/(app)/error.tsx` が、既存の `console.error` に加えて Sentry へのエラー送信を行う
  - [ ] コンポーネントテスト（`@sentry/nextjs` をモック）で、`error.tsx` と `global-error.tsx` が描画されたとき、渡されたエラーが `captureException` に渡される（各 1 回）
  - [ ] ブラウザ向けの初期化設定（DSN の有無で有効・無効を決める部分）は、環境変数から設定を組み立てる純粋関数として切り出し、DSN 未設定なら「初期化しない」と判定されることをユニットテストで検証する（ブラウザの実送信は Next 本体なしでは再現できないため、統合テストの対象外とする。この制約を「既知の制約」に追記する）
  - [ ] DSN が未設定の場合、`global-error.tsx` と `error.tsx` の Sentry 送信コードが例外をスローしない

### FEAT-SEN-004: 個人情報・秘密のフィルタリング

- **優先度**: Must
- **説明**: Sentry の `beforeSend` / `beforeSendTransaction` フックを用いて、イベントから個人情報・認証情報を除去するフィルタリング関数を実装する。除去対象はリクエストヘッダーの `cookie`・`authorization`・`x-pdf-token`、ユーザーの `email`・`ip_address`、リクエストボディ全体とする。フィルタリング関数は独立したモジュールとして実装し、単体テストで検証する。
- **受け入れ基準**:
  - [ ] フィルタリング関数のユニットテストが存在し、`cookie` ヘッダー除去・`authorization` ヘッダー除去・`x-pdf-token` ヘッダー除去・`user.email` 除去・`user.ip_address` 除去・`request.data`（ボディ）除去の各ケースがパスする
  - [ ] フィルタリング関数はイベントを**破棄しない**（常に除去処理後のイベントを返し、`null` は返さない）。ユーザー起因の想定内エラー（`REAUTH_REQUIRED` 等）は破棄ではなく、FEAT-SEN-005 のとおり警告レベルで送る
  - [ ] フィルタリング関数への入力が `null` や不完全なイベント形式の場合でも例外をスローしない（境界値テスト）

### FEAT-SEN-005: ウィジェットデータ取得失敗の構造化送信

- **優先度**: Must
- **説明**: `src/lib/observability/logger.ts` の `captureServerException`（現在 no-op）を実装し、`logWidgetFetchError` が呼ばれたとき、エラーコード・`dataSourceId`・`widgetId` をタグとして付与した上で Sentry に送信する。`REAUTH_REQUIRED` のようなユーザー起因の想定内エラーは `level: "warning"` とし、それ以外の障害は `level: "error"` とする（ノイズ抑制）。ユーザー情報（メールアドレス等）はタグに含めない。
- **受け入れ基準**:
  - [ ] `captureServerException` の呼び出しをモックした単体テストが存在し、`REAUTH_REQUIRED` エラーコードのとき `level` が `"warning"` になることを確認する
  - [ ] `captureServerException` の単体テストで、`REAUTH_REQUIRED` 以外のエラーコードのとき `level` が `"error"` になることを確認する
  - [ ] 単体テストで、送信されるイベントのタグに `errorCode`・`dataSourceId`・`widgetId` が含まれ、`email` や `userId` が含まれないことを確認する
  - [ ] DSN を設定した統合テスト環境でウィジェット取得失敗を模倣した呼び出しを行うと、ローカル受信サーバーが該当タグを持つイベントを受け取る

### FEAT-SEN-006: PDF 生成失敗・重要エラーの送信

- **優先度**: Should
- **説明**: `api/dashboards/[id]/pdf/route.ts`・`api/user/account/route.ts`・`lib/account/actions.ts`・`lib/auth/auth.ts`・`lib/audit/auditLog.ts` で `console.error` のみで握りつぶしている重要なエラーに、`captureServerException` 呼び出しを追加する。既存の `console.error` は維持する。PDF 生成失敗は過去に本番障害の原因となった経緯（検知不能だった事例）があるため、最優先で対応する。
- **注意**: 認証・アカウント関連のエラーは、メッセージやスタックに秘密が含まれ得るため、タグにはエラー名などの固定的な情報のみを付け、フィルタ（FEAT-SEN-004）を必ず経由させる。
- **受け入れ基準**:
  - [ ] `api/dashboards/[id]/pdf/route.ts` の PDF 生成失敗パスに `captureServerException` の呼び出しが追加されている（コードレビューで確認）
  - [ ] `lib/account/actions.ts` および `api/user/account/route.ts` のアカウント削除失敗パスに `captureServerException` の呼び出しが追加されている
  - [ ] `lib/auth/auth.ts` の認証エラーパスに `captureServerException` の呼び出しが追加されている
  - [ ] `lib/audit/auditLog.ts` の監査ログ書き込み失敗パスに `captureServerException` の呼び出しが追加されている
  - [ ] DSN を設定した統合テストで、PDF 生成失敗を模倣して `captureServerException` を呼ぶと、ローカル受信サーバーにイベントとして届く

---

## スプリント計画

### Sprint 1: Sentry エラートラッキングの全面導入

- **対象機能**: FEAT-SEN-001, FEAT-SEN-002, FEAT-SEN-003, FEAT-SEN-004, FEAT-SEN-005, FEAT-SEN-006
- **完了条件**:
  - [ ] `instrumentation.ts` が存在し、DSN 設定時に Node.js ランタイム向け Sentry を初期化する（Edge は対象外。既知の制約 (f) 参照）
  - [ ] `SENTRY_DSN` 未設定で `pnpm build`・`pnpm vitest run`・`pnpm e2e` が従来どおりパスし、外部接続が発生しない
  - [ ] 個人情報フィルタリング関数のユニットテストが全ケースパスする
  - [ ] `captureServerException` のユニットテストが、`REAUTH_REQUIRED` 時の `warning` レベルと通常エラー時の `error` レベルをそれぞれ検証しパスする
  - [ ] `global-error.tsx` が新設されている
  - [ ] `error.tsx` が Sentry 送信を含む形に更新されている
  - [ ] PDF 生成失敗・アカウント削除失敗・認証エラー・監査ログ失敗の各パスに `captureServerException` が追加されている
  - [ ] ローカル HTTP 受信サーバーを DSN の送信先に設定した統合テストが存在し、サーバーエラー（`onRequestError`）・ウィジェット取得失敗・PDF 生成失敗の各シナリオでイベントが届くこと・環境名とリリースが付くこと・個人情報が含まれないことを検証してパスする
  - [ ] `pnpm vitest run`（529 件以上）と `pnpm e2e`（31 件以上）が引き続きパスする

---

## 非機能要件

- **信頼性**: DSN が未設定の場合は完全に no-op となり、既存機能に影響を与えない。Sentry SDK 自体のエラーがアプリケーションのクラッシュを引き起こさないよう、初期化コードを try-catch で保護する。
- **セキュリティ**: `@sentry/nextjs` v11 では `sendDefaultPii` が廃止されたため、`beforeSend` フックで `scrubSentryEvent` を呼び出し、リクエストヘッダーの `cookie`・`authorization`・`x-pdf-token`・`set-cookie`・`proxy-authorization`・IP 関連ヘッダー、`request.cookies`・`query_string`・`url` クエリ部分、ユーザーの `email`・`ip_address`、リクエストボディを除去してから送信する。`NEXT_PUBLIC_SENTRY_DSN` はブラウザに公開される値であることを `NEXT_PUBLIC_` プレフィックスで明示する。
- **パフォーマンス**: `tracesSampleRate: 0`（無効）とし、エラートラッキングのみに絞る。Session Replay は使用しない。Sentry の初期化処理は非同期かつアプリの起動クリティカルパスをブロックしない。
- **テスト独立性**: 統合テストは外部ネットワークに接続しない。ローカル HTTP サーバーを DSN の送信先として使用し、テスト終了後に停止する。既存の `pnpm vitest run` のスコープに統合テストを含める（`src/**/*.test.*` のまま）。

---

## 既知の制約・今後の課題

| 項目 | 内容 |
|------|------|
| (a) ソースマップ未アップロード | `withSentryConfig` によるビルドプラグインが本スプリントの対象外のため、本番環境のスタックトレースは難読化（minify）されたままになる。エラーの発生箇所特定には `SENTRY_RELEASE` による照合が必要だが、完全な可読性は DSN 発行後に `withSentryConfig` を導入するまで得られない。 |
| (b) CSP との連携 | CSP を導入する際、Sentry のイベント送信先（`sentry.io` の取り込みエンドポイント）を `connect-src` ディレクティブに許可する必要がある。CSP 実装（`docs/bi-tool-spec.md` §7 の nonce 戦略）と同時に対応すること。 |
| (c) 実 DSN での送信確認 | 実際の Sentry プロジェクトへの DSN 発行と送信確認は運用側で行う。本仕様の統合テストはローカル受信サーバーを使うため、sentry.io への到達性・プロジェクト設定の正しさは運用者が別途確認する必要がある。 |
| (e) ブラウザ側の実送信 | ブラウザ向けの送信は、ローカル受信サーバーを使った統合テストでは検証しない（Next 本体とブラウザが必要なため）。エラー境界からの呼び出しはコンポーネントテスト、初期化の有無はユニットテストで担保し、実送信は実 DSN での運用確認（(c)）に委ねる。 |
| (d) `withSentryConfig` の導入 | Sentry 組織・プロジェクト・認証トークンが揃った後、次フェーズで `withSentryConfig` を `next.config.ts` に追加し、ソースマップをアップロードする。その際、`hideSourceMaps: true` を設定してソースマップをクライアントバンドルから除外することを推奨する。 |
| (f) Edge ランタイムでのエラー捕捉なし | `instrumentation.ts` は Node.js ランタイム限定で Sentry を初期化する。Edge ランタイム（middleware）では初期化しないため、middleware で発生したエラーは Sentry に送信されない。理由: `@sentry/nextjs` を Edge バンドルに含めると `edge-instrumentation.js` が 238 kB から 13 kB へと 225 kB 増加するため。本プロジェクトの middleware はセッション判定のみで Sentry 送信が必要なエラーは発生しないため、この制約は実質的な影響を与えない。 |
