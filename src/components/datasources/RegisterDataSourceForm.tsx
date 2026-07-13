"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  apiErrorResponseSchema,
  createDataSourceApiResponseSchema,
  previewApiResponseSchema,
  type AuthMode,
  type PreviewResult,
  type SheetFetchErrorCode,
} from "@/lib/sheets/schema";
import { DataSourcePreviewTable } from "@/components/datasources/DataSourcePreviewTable";

/**
 * データソース登録フォーム（状態管理つきクライアントコンポーネント）。
 *
 * - 表示は `DataSourcePreviewTable` に委譲し、ここではフォーム状態・API 呼び出しの
 *   オーケストレーションのみを担当する
 *   （.claude/rules/architecture.md: 「データ取得・状態管理」と「表示」を分離する）。
 * - Sheets へのアクセス・トークンの扱いはすべてサーバー側 API（`/api/datasources*`）が
 *   担当し、このコンポーネントは結果（プレビュー・エラー種別）だけを受け取る。
 * - 「プレビュー → 登録」の2段階フローを強制する: 入力変更後は再プレビューが必要になる
 *   （未確認のまま登録することを防ぎ、原因不明の登録失敗を減らす）。
 */

const REFRESH_INTERVAL_OPTIONS = [60, 300, 900, 3600] as const;

type FormState = {
  name: string;
  spreadsheetUrl: string;
  range: string;
  authMode: AuthMode;
  refreshIntervalSec: number;
};

const INITIAL_STATE: FormState = {
  name: "",
  spreadsheetUrl: "",
  range: "",
  authMode: "PUBLIC",
  refreshIntervalSec: 300,
};

type AsyncStatus = "idle" | "loading" | "error";

type ErrorDisplay = {
  code: string;
  message: string;
};

function isKnownErrorCode(
  code: string,
  labels: Record<string, string>,
): code is
  | SheetFetchErrorCode
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_BODY"
  | "UNKNOWN" {
  return code in labels;
}

export function RegisterDataSourceForm() {
  const t = useTranslations("datasources.form");
  const tPreview = useTranslations("datasources.preview");
  const tErrors = useTranslations("datasources.errors");
  const router = useRouter();

  const formId = useId();

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  // プレビュー取得後に入力が変わったら、古いプレビューのまま登録できないようにする
  const [previewStaleKey, setPreviewStaleKey] = useState<string | null>(null);

  const [previewStatus, setPreviewStatus] = useState<AsyncStatus>("idle");
  const [submitStatus, setSubmitStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<ErrorDisplay | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentKey = JSON.stringify({
    spreadsheetUrl: form.spreadsheetUrl,
    range: form.range,
    authMode: form.authMode,
  });
  const previewIsFresh = preview !== null && previewStaleKey === currentKey;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // 取得条件に関わる項目が変わったら、プレビューを無効化する
    if (key === "spreadsheetUrl" || key === "range" || key === "authMode") {
      setPreview(null);
      setPreviewStaleKey(null);
    }
    setSuccessMessage(null);
  }

  function describeError(code: string, message: string): ErrorDisplay {
    const labels = {
      INVALID_RANGE: tErrors("INVALID_RANGE"),
      NOT_FOUND: tErrors("NOT_FOUND"),
      FORBIDDEN: tErrors("FORBIDDEN"),
      PARSE_ERROR: tErrors("PARSE_ERROR"),
      EMPTY_RESULT: tErrors("EMPTY_RESULT"),
      NETWORK_ERROR: tErrors("NETWORK_ERROR"),
      REAUTH_REQUIRED: tErrors("REAUTH_REQUIRED"),
      VALIDATION_ERROR: tErrors("VALIDATION_ERROR"),
      UNAUTHENTICATED: tErrors("UNAUTHENTICATED"),
      INVALID_BODY: tErrors("INVALID_BODY"),
      UNKNOWN: tErrors("UNKNOWN"),
    };

    if (isKnownErrorCode(code, labels)) {
      return { code, message: labels[code] };
    }
    return { code, message };
  }

  async function parseErrorResponse(response: Response): Promise<ErrorDisplay> {
    try {
      const json: unknown = await response.json();
      const parsed = apiErrorResponseSchema.safeParse(json);
      if (parsed.success) {
        return describeError(parsed.data.error.code, parsed.data.error.message);
      }
    } catch {
      // フォールスルーして UNKNOWN を返す
    }
    return describeError("UNKNOWN", tErrors("UNKNOWN"));
  }

  async function handlePreview(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setPreviewStatus("loading");

    try {
      const response = await fetch("/api/datasources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetUrl: form.spreadsheetUrl,
          range: form.range,
          authMode: form.authMode,
        }),
      });

      if (!response.ok) {
        setError(await parseErrorResponse(response));
        setPreview(null);
        setPreviewStaleKey(null);
        setPreviewStatus("error");
        return;
      }

      const json: unknown = await response.json();
      const parsed = previewApiResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError(describeError("UNKNOWN", tErrors("UNKNOWN")));
        setPreviewStatus("error");
        return;
      }

      setPreview(parsed.data.data);
      setPreviewStaleKey(currentKey);
      setPreviewStatus("idle");
    } catch {
      setError(describeError("NETWORK_ERROR", tErrors("NETWORK_ERROR")));
      setPreview(null);
      setPreviewStaleKey(null);
      setPreviewStatus("error");
    }
  }

  async function handleSubmit() {
    setError(null);
    setSuccessMessage(null);
    setSubmitStatus("loading");

    try {
      const response = await fetch("/api/datasources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          spreadsheetUrl: form.spreadsheetUrl,
          range: form.range,
          authMode: form.authMode,
          refreshIntervalSec: form.refreshIntervalSec,
        }),
      });

      if (!response.ok) {
        setError(await parseErrorResponse(response));
        setSubmitStatus("error");
        return;
      }

      const json: unknown = await response.json();
      const parsed = createDataSourceApiResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError(describeError("UNKNOWN", tErrors("UNKNOWN")));
        setSubmitStatus("error");
        return;
      }

      setSuccessMessage(t("successMessage", { name: parsed.data.data.name }));
      setForm(INITIAL_STATE);
      setPreview(null);
      setPreviewStaleKey(null);
      setSubmitStatus("idle");
      router.refresh();
    } catch {
      setError(describeError("NETWORK_ERROR", tErrors("NETWORK_ERROR")));
      setSubmitStatus("error");
    }
  }

  const typeLabels = {
    number: tPreview("typeNumber"),
    date: tPreview("typeDate"),
    string: tPreview("typeString"),
  } as const;

  const isPreviewLoading = previewStatus === "loading";
  const isSubmitting = submitStatus === "loading";
  const canSubmit =
    previewIsFresh && form.name.trim().length > 0 && !isSubmitting;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handlePreview}
        className="flex flex-col gap-4 rounded-xl border border-black/10 p-5 dark:border-white/15"
        aria-describedby={`${formId}-description`}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">{t("heading")}</h2>
          <p
            id={`${formId}-description`}
            className="text-sm text-black/60 dark:text-white/60"
          >
            {t("description")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-name`} className="text-sm font-medium">
            {t("nameLabel")}
          </label>
          <input
            id={`${formId}-name`}
            name="name"
            type="text"
            required
            placeholder={t("namePlaceholder")}
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm placeholder:text-black/35 outline-none focus:border-black/40 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-url`} className="text-sm font-medium">
            {t("urlLabel")}
          </label>
          <input
            id={`${formId}-url`}
            name="spreadsheetUrl"
            type="text"
            required
            placeholder={t("urlPlaceholder")}
            value={form.spreadsheetUrl}
            onChange={(event) =>
              updateField("spreadsheetUrl", event.target.value)
            }
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm placeholder:text-black/35 outline-none focus:border-black/40 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50"
          />
          <p className="text-xs text-black/50 dark:text-white/50">
            {t("urlHelp")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-range`} className="text-sm font-medium">
            {t("rangeLabel")}
          </label>
          <input
            id={`${formId}-range`}
            name="range"
            type="text"
            required
            placeholder={t("rangePlaceholder")}
            value={form.range}
            onChange={(event) => updateField("range", event.target.value)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm placeholder:text-black/35 outline-none focus:border-black/40 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50"
          />
          <p className="text-xs text-black/50 dark:text-white/50">
            {t("rangeHelp")}
          </p>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">{t("authModeLabel")}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="authMode"
              value="PUBLIC"
              checked={form.authMode === "PUBLIC"}
              onChange={() => updateField("authMode", "PUBLIC")}
            />
            {t("authModePublic")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="authMode"
              value="OAUTH"
              checked={form.authMode === "OAUTH"}
              onChange={() => updateField("authMode", "OAUTH")}
            />
            {t("authModeOauth")}
          </label>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-refresh`} className="text-sm font-medium">
            {t("refreshIntervalLabel")}
          </label>
          <select
            id={`${formId}-refresh`}
            name="refreshIntervalSec"
            value={form.refreshIntervalSec}
            onChange={(event) =>
              updateField("refreshIntervalSec", Number(event.target.value))
            }
            className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-900 dark:text-white dark:focus:border-white/50"
          >
            {REFRESH_INTERVAL_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} 秒
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={
            isPreviewLoading ||
            !form.spreadsheetUrl.trim() ||
            !form.range.trim()
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/[.06]"
        >
          {isPreviewLoading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {t("previewingButton")}
            </>
          ) : (
            t("previewButton")
          )}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error.message}
        </div>
      ) : null}

      {successMessage ? (
        <div
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
        >
          {successMessage}
        </div>
      ) : null}

      {preview ? (
        <DataSourcePreviewTable
          preview={preview}
          messages={{
            heading: tPreview("heading"),
            columnsHeading: tPreview("columnsHeading"),
            rowsHeading: (count) => tPreview("rowsHeading", { count }),
            totalRowCount: (count) => tPreview("totalRowCount", { count }),
            truncatedNote: (count) => tPreview("truncatedNote", { count }),
            typeLabels,
            emptyRows: tPreview("emptyRows"),
          }}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {!previewIsFresh ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            {t("previewRequiredHint")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isSubmitting ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {t("submittingButton")}
            </>
          ) : (
            t("submitButton")
          )}
        </button>
      </div>
    </div>
  );
}
