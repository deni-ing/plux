-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('LEUMI', 'MAX', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "TxnDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('SETTLED', 'PENDING');

-- CreateEnum
CREATE TYPE "TxnKind" AS ENUM ('PURCHASE', 'INCOME', 'FEE', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'STANDING_ORDER', 'CARD_SETTLEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('PROVIDER', 'RULE', 'AI', 'USER');

-- CreateEnum
CREATE TYPE "SubscriptionState" AS ENUM ('ACTIVE', 'UNUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceFormat" AS ENUM ('MAX_XLSX', 'LEUMI_PDF', 'LEUMI_XLSX', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "type" "AccountType" NOT NULL,
    "label" TEXT NOT NULL,
    "last4" TEXT,
    "accountLast4" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "balance" DECIMAL(14,2),
    "balanceAt" TIMESTAMP(3),
    "billingCycleDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "importJobId" TEXT,
    "bookedAt" DATE NOT NULL,
    "chargedAt" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "originalAmount" DECIMAL(14,2),
    "originalCurrency" TEXT,
    "fxRate" DECIMAL(12,6),
    "merchantRaw" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "descriptor" TEXT,
    "providerCategory" TEXT,
    "categoryId" TEXT,
    "categorySource" "CategorySource" NOT NULL DEFAULT 'RULE',
    "kind" "TxnKind" NOT NULL DEFAULT 'PURCHASE',
    "direction" "TxnDirection" NOT NULL,
    "status" "TxnStatus" NOT NULL DEFAULT 'SETTLED',
    "cardLast4" TEXT,
    "txnType" TEXT,
    "channel" TEXT,
    "note" TEXT,
    "balanceAfter" DECIMAL(14,2),
    "countsAsSpending" BOOLEAN NOT NULL DEFAULT true,
    "dedupHash" TEXT NOT NULL,
    "occurrence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subscriptionId" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "confidence" DECIMAL(4,3) NOT NULL,
    "declaredByProvider" BOOLEAN NOT NULL DEFAULT false,
    "state" "SubscriptionState" NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" DATE NOT NULL,
    "lastSeenAt" DATE NOT NULL,
    "nextDueAt" DATE,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthlyCap" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "saved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "targetAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" "SourceFormat" NOT NULL DEFAULT 'UNKNOWN',
    "statementPeriod" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "reconciled" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "facts" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_userId_provider_label_key" ON "accounts"("userId", "provider", "label");

-- CreateIndex
CREATE INDEX "transactions_userId_bookedAt_idx" ON "transactions"("userId", "bookedAt");

-- CreateIndex
CREATE INDEX "transactions_userId_categoryId_bookedAt_idx" ON "transactions"("userId", "categoryId", "bookedAt");

-- CreateIndex
CREATE INDEX "transactions_userId_merchant_idx" ON "transactions"("userId", "merchant");

-- CreateIndex
CREATE INDEX "transactions_accountId_bookedAt_idx" ON "transactions"("accountId", "bookedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_userId_dedupHash_occurrence_key" ON "transactions"("userId", "dedupHash", "occurrence");

-- CreateIndex
CREATE INDEX "categories_userId_idx" ON "categories"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_userId_name_key" ON "categories"("userId", "name");

-- CreateIndex
CREATE INDEX "category_rules_userId_idx" ON "category_rules"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "category_rules_userId_pattern_key" ON "category_rules"("userId", "pattern");

-- CreateIndex
CREATE INDEX "subscriptions_userId_state_idx" ON "subscriptions"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_merchant_amount_key" ON "subscriptions"("userId", "merchant", "amount");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_userId_categoryId_key" ON "budgets"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "savings_goals_userId_idx" ON "savings_goals"("userId");

-- CreateIndex
CREATE INDEX "import_jobs_userId_startedAt_idx" ON "import_jobs"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "analytics_snapshots_userId_computedAt_idx" ON "analytics_snapshots"("userId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_userId_periodStart_periodEnd_key" ON "analytics_snapshots"("userId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
