import "server-only";

import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/auditLog";

/**
 * ユーザーのアカウントと全関連データをトランザクション内で削除する（FEAT-015）。
 *
 * 削除順序:
 * 1. Widget（Dashboard 配下・DataSource.onDelete: SetNull の競合回避のため先に削除）
 * 2. DataSource（Widget が消えているため使用中チェックは不要）
 * 3. Dashboard（Widget は既に削除済み）
 * 4. PdfToken（userId 参照）
 * 5. AuditLog の userId を NULL に更新（onDelete: SetNull に従い、ログ自体は保持）
 * 6. Account（Auth.js OAuth アカウント・onDelete: Cascade）
 * 7. User（Account / Session / AuditLog の外部キーが onDelete: Cascade / SetNull のため最後）
 *
 * Note: User.accounts, User.sessions は onDelete: Cascade のため User 削除で自動削除される。
 *       AuditLog.user は onDelete: SetNull のためログは残り、userId が NULL になる。
 *
 * @param userId 削除するユーザーの ID（`session.user.id`）
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  // 削除前に監査ログを記録する（ユーザー削除後は userId が NULL になるため先に記録）
  await recordAuditEvent({
    type: "ACCOUNT_DELETE",
    userId,
    metadata: { initiatedBy: "user" },
  });

  await prisma.$transaction(async (tx) => {
    // 1. ユーザーが所有するダッシュボードに紐づく Widget を一括削除
    //    （DataSource.onDelete: SetNull と競合させないよう Widget から先に消す）
    const dashboards = await tx.dashboard.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const dashboardIds = dashboards.map((d) => d.id);

    if (dashboardIds.length > 0) {
      await tx.widget.deleteMany({
        where: { dashboardId: { in: dashboardIds } },
      });
    }

    // 2. DataSource を削除（Widget が消えているため FK 制約に引っかからない）
    await tx.dataSource.deleteMany({ where: { ownerId: userId } });

    // 3. Dashboard を削除（Widget は既に削除済み）
    await tx.dashboard.deleteMany({ where: { ownerId: userId } });

    // 4. PdfToken を削除
    await tx.pdfToken.deleteMany({ where: { userId } });

    // 5. User を削除（Account・Session は onDelete: Cascade で連鎖削除）
    //    AuditLog.userId は onDelete: SetNull で NULL になる（ログ自体は保持）
    await tx.user.delete({ where: { id: userId } });
  });
}
