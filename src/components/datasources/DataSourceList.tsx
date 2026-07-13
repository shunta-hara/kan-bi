"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

import type {
  AuthMode,
  DataSourceUsage,
  SyncStatus,
} from "@/lib/sheets/schema";
import { formatDateTimeShort } from "@/i18n/localeUtils";
import type { AppLocale } from "@/i18n/locales";
import {
  DataSourceCard,
  type DataSourceCardItem,
} from "@/components/datasources/DataSourceCard";
import { EditDataSourcePanel } from "@/components/datasources/EditDataSourcePanel";

export type DataSourceListItem = {
  id: string;
  name: string;
  spreadsheetId: string;
  range: string;
  authMode: AuthMode;
  refreshIntervalSec: number;
  usage: DataSourceUsage;
  syncStatus: SyncStatus;
  updatedAt: Date;
};

type DataSourceListMessages = {
  emptyTitle: string;
  emptyDescription: string;
  spreadsheetIdLabel: string;
  rangeLabel: string;
  authModeLabel: string;
  refreshIntervalLabel: string;
  updatedAtLabel: string;
  authModeLabels: Record<AuthMode, string>;
  usageLabel: string;
  usageNone: string;
  editButton: string;
  closeButton: string;
  reauthRequiredBadge: string;
};

type DataSourceListProps = {
  dataSources: DataSourceListItem[];
  messages: DataSourceListMessages;
  /**
   * ウィジェット設定などの選択モードで使うコールバック。
   * 提供された場合、一覧アイテムをクリックすると `id` を引数に呼び出す。
   * 未提供の場合は通常の編集モード（EditDataSourcePanel を開く）として振る舞う。
   */
  onSelect?: (id: string) => void;
};

/**
 * 登録済みデータソースの一覧表示・編集導線（状態管理つきクライアントコンポーネント）。
 *
 * - 一覧そのものの表示は `DataSourceCard` に、編集（名称・範囲・更新間隔・列型上書き・削除）は
 *   `EditDataSourcePanel` に委譲し、ここでは「どれが選択されているか」だけを管理する
 *   （.claude/rules/architecture.md: 「データ取得・状態管理」と「表示」を分離する）。
 * - 削除完了時はローカルの一覧からも即座に取り除き、ページ全体のリロードを待たずに
 *   「使用されていないデータソースは削除でき、一覧から消える」(FEAT-003) を反映する。
 *   （`EditDataSourcePanel` 側で `router.refresh()` も呼ぶため、サーバー側の状態とも整合する）
 */
export function DataSourceList({
  dataSources,
  messages,
  onSelect,
}: DataSourceListProps) {
  const locale = useLocale() as AppLocale;
  const [items, setItems] = useState(dataSources);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 親（Server Component）から渡される一覧が更新された場合に追従する
  // （`router.refresh()` 後の再レンダリングで props が変わるケースに対応）。
  useEffect(() => {
    setItems(dataSources);
  }, [dataSources]);

  function handleEdit(id: string) {
    if (onSelect) {
      // 選択モード（ウィジェット設定等）では EditDataSourcePanel は開かず、
      // 呼び出し元に選択された id を通知する。
      onSelect(id);
      return;
    }
    setSelectedId((current) => (current === id ? null : id));
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function handleClose() {
    setSelectedId(null);
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-black/15 p-12 text-center dark:border-white/20">
        <h2 className="text-lg font-medium">{messages.emptyTitle}</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          {messages.emptyDescription}
        </p>
      </div>
    );
  }

  const cardMessages = {
    spreadsheetIdLabel: messages.spreadsheetIdLabel,
    rangeLabel: messages.rangeLabel,
    authModeLabel: messages.authModeLabel,
    refreshIntervalLabel: messages.refreshIntervalLabel,
    updatedAtLabel: messages.updatedAtLabel,
    authModeLabels: messages.authModeLabels,
    usageLabel: messages.usageLabel,
    usageNone: messages.usageNone,
    editButton: messages.editButton,
    closeButton: messages.closeButton,
    reauthRequiredBadge: messages.reauthRequiredBadge,
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((dataSource) => {
          const cardItem: DataSourceCardItem = {
            ...dataSource,
            updatedAtFormatted: formatDateTimeShort(
              dataSource.updatedAt,
              locale,
            ),
          };
          return (
            <DataSourceCard
              key={dataSource.id}
              dataSource={cardItem}
              messages={cardMessages}
              isSelected={selectedId === dataSource.id}
              onEdit={handleEdit}
            />
          );
        })}
      </ul>

      {selectedId ? (
        <EditDataSourcePanel
          key={selectedId}
          dataSourceId={selectedId}
          onDeleted={handleDeleted}
          onClose={handleClose}
        />
      ) : null}
    </div>
  );
}
