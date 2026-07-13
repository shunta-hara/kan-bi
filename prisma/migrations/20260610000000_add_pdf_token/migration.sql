-- CreateTable
CREATE TABLE "PdfToken" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfToken_jti_key" ON "PdfToken"("jti");

-- CreateIndex
CREATE INDEX "PdfToken_userId_idx" ON "PdfToken"("userId");

-- CreateIndex
CREATE INDEX "PdfToken_dashboardId_idx" ON "PdfToken"("dashboardId");

-- CreateIndex
CREATE INDEX "PdfToken_expiresAt_idx" ON "PdfToken"("expiresAt");
