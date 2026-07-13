"use client";

import { useEffect, useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";

import {
  apiErrorResponseSchema,
  dataSourceDetailApiResponseSchema,
  dataSourceInUseErrorSchema,
  updateDataSourceApiResponseSchema,
  refreshDataSourceApiResponseSchema,
  rateLimitErrorSchema,
  type ColumnDataType,
  type ColumnTypeOverrides,
  type DataSourceDetail,
  type DataSourceUsage,
  type SyncStatus,
} from "@/lib/sheets/schema";

/**
 * `EditDataSourcePanel` のロジックを抽出したカスタムフック（FEAT-003 / FEAT-004 / FEAT-005 / FEAT-006）。
 *
 * 責務分離の方針（.claude/rules/architecture.md）:
 * - このフックは「データ取得・状態管理・API 呼び出しのオーケストレーション」を担う
 * - `EditDataSourcePanel` コンポーネントは「表示」と「イベントのルーティング」のみを担う
 *
 * フックとして切り出した理由:
 * - `EditDataSourcePanel.tsx` が 525 行を超え、アーキテクチャルールの目安（300 行）を超過していた
 * - ロジックのテスト容易性を高める（将来的にフックのユニットテストが書きやすくなる）
 */

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type FetchStatus = "loading" | "ready" | "error";
export type SaveStatus = "idle" | "saving" | "error";
export type DeleteStatus = "idle" | "deleting" | "blocked" | "error";
export type RefreshStatus =
  | "idle"
  | "refreshing"
  | "success"
  | "error"
  | "rate_limited";

export type ErrorDisplay = { code: string; message: string };

// ─────────────────────────────────────────────
// 状態定義（useReducer）
// ─────────────────────────────────────────────

type State = {
  fetchStatus: FetchStatus;
  detail: DataSourceDetail | null;
  fetchError: ErrorDisplay | null;

  name: string;
  range: string;
  refreshIntervalSec: number;
  overrides: Partial<Record<string, ColumnDataType>>;

  saveStatus: SaveStatus;
  saveError: ErrorDisplay | null;
  /** true のとき「保存しました」メッセージを表示する */
  didSave: boolean;

  deleteStatus: DeleteStatus;
  deleteError: ErrorDisplay | null;
  blockedUsage: DataSourceUsage | null;
  confirmingDelete: boolean;

  refreshStatus: RefreshStatus;
  refreshError: ErrorDisplay | null;
  /** true のとき「更新しました」メッセージを表示する */
  didRefresh: boolean;
  /** レート制限時の再試行可能時刻（ミリ秒） */
  retryAfterMs: number | null;
};

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: DataSourceDetail }
  | { type: "FETCH_ERROR"; payload: ErrorDisplay }
  | { type: "SET_NAME"; payload: string }
  | { type: "SET_RANGE"; payload: string }
  | { type: "SET_REFRESH_INTERVAL"; payload: number }
  | {
      type: "SET_OVERRIDE";
      payload: { columnName: string; dataType: ColumnDataType | null };
    }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; payload: Partial<DataSourceDetail> }
  | { type: "SAVE_ERROR"; payload: ErrorDisplay }
  | { type: "DELETE_START" }
  | { type: "DELETE_BLOCKED"; payload: DataSourceUsage }
  | { type: "DELETE_ERROR"; payload: ErrorDisplay }
  | { type: "CONFIRM_DELETE"; payload: boolean }
  | { type: "REFRESH_START" }
  | {
      type: "REFRESH_SUCCESS";
      payload: { syncStatus: SyncStatus; lastSyncedAt: Date | null };
    }
  | { type: "REFRESH_ERROR"; payload: ErrorDisplay }
  | { type: "REFRESH_RATE_LIMITED"; payload: { retryAfterMs: number } }
  | { type: "REFRESH_REAUTH_REQUIRED"; payload: ErrorDisplay };

function createInitialState(): State {
  return {
    fetchStatus: "loading",
    detail: null,
    fetchError: null,
    name: "",
    range: "",
    refreshIntervalSec: 300,
    overrides: {},
    saveStatus: "idle",
    saveError: null,
    didSave: false,
    deleteStatus: "idle",
    deleteError: null,
    blockedUsage: null,
    confirmingDelete: false,
    refreshStatus: "idle",
    refreshError: null,
    didRefresh: false,
    retryAfterMs: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return {
        ...createInitialState(),
        fetchStatus: "loading",
      };

    case "FETCH_SUCCESS":
      return {
        ...state,
        fetchStatus: "ready",
        fetchError: null,
        detail: action.payload,
        name: action.payload.name,
        range: action.payload.range,
        refreshIntervalSec: action.payload.refreshIntervalSec,
        overrides: { ...action.payload.columnTypes },
      };

    case "FETCH_ERROR":
      return { ...state, fetchStatus: "error", fetchError: action.payload };

    case "SET_NAME":
      return { ...state, name: action.payload, didSave: false };

    case "SET_RANGE":
      return { ...state, range: action.payload, didSave: false };

    case "SET_REFRESH_INTERVAL":
      return { ...state, refreshIntervalSec: action.payload, didSave: false };

    case "SET_OVERRIDE": {
      const next = { ...state.overrides };
      if (action.payload.dataType === null) {
        delete next[action.payload.columnName];
      } else {
        next[action.payload.columnName] = action.payload.dataType;
      }
      return { ...state, overrides: next, didSave: false };
    }

    case "SAVE_START":
      return {
        ...state,
        saveStatus: "saving",
        saveError: null,
        didSave: false,
      };

    case "SAVE_SUCCESS":
      return {
        ...state,
        saveStatus: "idle",
        didSave: true,
        detail: state.detail ? { ...state.detail, ...action.payload } : null,
      };

    case "SAVE_ERROR":
      return { ...state, saveStatus: "error", saveError: action.payload };

    case "DELETE_START":
      return {
        ...state,
        deleteStatus: "deleting",
        deleteError: null,
        blockedUsage: null,
      };

    case "DELETE_BLOCKED":
      return {
        ...state,
        deleteStatus: "blocked",
        blockedUsage: action.payload,
      };

    case "DELETE_ERROR":
      return {
        ...state,
        deleteStatus: "error",
        deleteError: action.payload,
      };

    case "CONFIRM_DELETE":
      return { ...state, confirmingDelete: action.payload };

    case "REFRESH_START":
      return {
        ...state,
        refreshStatus: "refreshing",
        refreshError: null,
        didRefresh: false,
        retryAfterMs: null,
      };

    case "REFRESH_SUCCESS":
      return {
        ...state,
        refreshStatus: "success",
        didRefresh: true,
        detail: state.detail
          ? {
              ...state.detail,
              syncStatus: action.payload.syncStatus,
              lastSyncedAt: action.payload.lastSyncedAt,
              lastSyncError: null,
            }
          : null,
      };

    case "REFRESH_ERROR":
      return {
        ...state,
        refreshStatus: "error",
        refreshError: action.payload,
      };

    case "REFRESH_RATE_LIMITED":
      return {
        ...state,
        refreshStatus: "rate_limited",
        retryAfterMs: action.payload.retryAfterMs,
      };

    case "REFRESH_REAUTH_REQUIRED":
      return {
        ...state,
        refreshStatus: "error",
        refreshError: action.payload,
        detail: state.detail
          ? { ...state.detail, syncStatus: "REAUTH_REQUIRED" }
          : null,
      };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────
// フック本体
// ─────────────────────────────────────────────

type UseEditDataSourceOptions = {
  dataSourceId: string;
  onDeleted: (id: string) => void;
  onClose: () => void;
  messages: {
    savedMessage: string;
    refreshedMessage: string;
    errors: Record<string, string>;
  };
};

export function useEditDataSource({
  dataSourceId,
  onDeleted,
  onClose,
  messages,
}: UseEditDataSourceOptions) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  function describeError(code: string): ErrorDisplay {
    const label = messages.errors[code];
    if (label) return { code, message: label };
    return { code, message: messages.errors["UNKNOWN"] ?? code };
  }

  // ─── データ取得 ───────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      dispatch({ type: "FETCH_START" });

      try {
        const response = await fetch(`/api/datasources/${dataSourceId}`);
        if (cancelled) return;

        if (!response.ok) {
          const json: unknown = await response.json().catch(() => null);
          const parsed = apiErrorResponseSchema.safeParse(json);
          dispatch({
            type: "FETCH_ERROR",
            payload: parsed.success
              ? describeError(parsed.data.error.code)
              : describeError("UNKNOWN"),
          });
          return;
        }

        const json: unknown = await response.json();
        const parsed = dataSourceDetailApiResponseSchema.safeParse(json);
        if (!parsed.success) {
          dispatch({ type: "FETCH_ERROR", payload: describeError("UNKNOWN") });
          return;
        }

        dispatch({ type: "FETCH_SUCCESS", payload: parsed.data.data });
      } catch {
        if (cancelled) return;
        dispatch({
          type: "FETCH_ERROR",
          payload: describeError("NETWORK_ERROR"),
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId]);

  // ─── 定期自動更新（FEAT-005: refreshIntervalSec に従いバックグラウンドで再取得）──────

  useEffect(() => {
    // detail が取得できていない場合・REAUTH_REQUIRED 状態では自動更新をスキップ
    if (!state.detail) return;
    if (state.detail.syncStatus === "REAUTH_REQUIRED") return;

    const intervalMs = state.detail.refreshIntervalSec * 1000;
    const timerId = setInterval(() => {
      // 手動更新・保存中は自動更新をスキップ（競合防止）
      if (
        state.refreshStatus === "refreshing" ||
        state.saveStatus === "saving"
      ) {
        return;
      }
      void fetch(`/api/datasources/${dataSourceId}/refresh`, {
        method: "POST",
      })
        .then(async (response) => {
          if (!response.ok) return;
          const json: unknown = await response.json().catch(() => null);
          const parsed = refreshDataSourceApiResponseSchema.safeParse(json);
          if (!parsed.success) return;
          dispatch({
            type: "REFRESH_SUCCESS",
            payload: {
              syncStatus: parsed.data.data.syncStatus,
              lastSyncedAt: parsed.data.data.lastSyncedAt,
            },
          });
          router.refresh();
        })
        .catch(() => {
          // バックグラウンド更新の失敗はサイレントに無視する
          // （ユーザーが「今すぐ更新」で手動確認できるため、通知不要）
        });
    }, intervalMs);

    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataSourceId,
    state.detail?.refreshIntervalSec,
    state.detail?.syncStatus,
  ]);

  // ─── 保存 ──────────────────────────────────

  const handleSave = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!state.detail) return;

      dispatch({ type: "SAVE_START" });

      const overridesPayload: ColumnTypeOverrides = Object.fromEntries(
        Object.entries(state.overrides).filter(
          (entry): entry is [string, ColumnDataType] => entry[1] !== undefined,
        ),
      );

      try {
        const response = await fetch(`/api/datasources/${dataSourceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: state.name,
            range: state.range,
            refreshIntervalSec: state.refreshIntervalSec,
            columnTypes:
              Object.keys(overridesPayload).length > 0
                ? overridesPayload
                : null,
          }),
        });

        if (!response.ok) {
          const json: unknown = await response.json().catch(() => null);
          const parsed = apiErrorResponseSchema.safeParse(json);
          dispatch({
            type: "SAVE_ERROR",
            payload: parsed.success
              ? describeError(parsed.data.error.code)
              : describeError("UNKNOWN"),
          });
          return;
        }

        const json: unknown = await response.json();
        const parsed = updateDataSourceApiResponseSchema.safeParse(json);
        if (!parsed.success) {
          dispatch({ type: "SAVE_ERROR", payload: describeError("UNKNOWN") });
          return;
        }

        dispatch({ type: "SAVE_SUCCESS", payload: parsed.data.data });
        router.refresh();
      } catch {
        dispatch({
          type: "SAVE_ERROR",
          payload: describeError("NETWORK_ERROR"),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dataSourceId,
      state.detail,
      state.name,
      state.range,
      state.refreshIntervalSec,
      state.overrides,
    ],
  );

  // ─── 削除 ──────────────────────────────────

  const handleDelete = useCallback(async () => {
    dispatch({ type: "DELETE_START" });

    try {
      const response = await fetch(`/api/datasources/${dataSourceId}`, {
        method: "DELETE",
      });

      if (response.status === 204) {
        onDeleted(dataSourceId);
        router.refresh();
        return;
      }

      const json: unknown = await response.json().catch(() => null);

      if (response.status === 409) {
        const parsed = dataSourceInUseErrorSchema.safeParse(json);
        if (parsed.success) {
          dispatch({
            type: "DELETE_BLOCKED",
            payload: parsed.data.error.usage,
          });
          return;
        }
      }

      const parsed = apiErrorResponseSchema.safeParse(json);
      dispatch({
        type: "DELETE_ERROR",
        payload: parsed.success
          ? describeError(parsed.data.error.code)
          : describeError("UNKNOWN"),
      });
    } catch {
      dispatch({
        type: "DELETE_ERROR",
        payload: describeError("NETWORK_ERROR"),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId, onDeleted]);

  // ─── 今すぐ更新（FEAT-005） ────────────────────

  const handleRefresh = useCallback(async () => {
    dispatch({ type: "REFRESH_START" });

    try {
      const response = await fetch(`/api/datasources/${dataSourceId}/refresh`, {
        method: "POST",
      });

      if (response.status === 429) {
        const json: unknown = await response.json().catch(() => null);
        const parsed = rateLimitErrorSchema.safeParse(json);
        dispatch({
          type: "REFRESH_RATE_LIMITED",
          payload: {
            retryAfterMs: parsed.success
              ? parsed.data.error.retryAfterSec * 1000
              : 60_000,
          },
        });
        return;
      }

      // REAUTH_REQUIRED は 422 で返ってくる（レスポンスボディに code: "REAUTH_REQUIRED"）
      if (response.status === 422) {
        const json: unknown = await response.json().catch(() => null);
        const errorParsed = apiErrorResponseSchema.safeParse(json);
        const code = errorParsed.success
          ? errorParsed.data.error.code
          : "UNKNOWN";

        if (code === "REAUTH_REQUIRED") {
          dispatch({
            type: "REFRESH_REAUTH_REQUIRED",
            payload: describeError("REAUTH_REQUIRED"),
          });
          return;
        }

        dispatch({
          type: "REFRESH_ERROR",
          payload: describeError(code),
        });
        return;
      }

      if (!response.ok) {
        const json: unknown = await response.json().catch(() => null);
        const parsed = apiErrorResponseSchema.safeParse(json);
        dispatch({
          type: "REFRESH_ERROR",
          payload: parsed.success
            ? describeError(parsed.data.error.code)
            : describeError("UNKNOWN"),
        });
        return;
      }

      const json: unknown = await response.json();
      const parsed = refreshDataSourceApiResponseSchema.safeParse(json);
      if (!parsed.success) {
        dispatch({ type: "REFRESH_ERROR", payload: describeError("UNKNOWN") });
        return;
      }

      dispatch({
        type: "REFRESH_SUCCESS",
        payload: {
          syncStatus: parsed.data.data.syncStatus,
          lastSyncedAt: parsed.data.data.lastSyncedAt,
        },
      });
      router.refresh();
    } catch {
      dispatch({
        type: "REFRESH_ERROR",
        payload: describeError("NETWORK_ERROR"),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId]);

  return {
    // 状態
    ...state,
    // 派生値: didSave / didRefresh フラグをメッセージ文字列に変換
    savedMessageText: state.didSave ? messages.savedMessage : null,
    refreshedMessageText: state.didRefresh ? messages.refreshedMessage : null,
    // アクション
    dispatch,
    handleSave,
    handleDelete,
    handleRefresh,
    onClose,
  };
}
