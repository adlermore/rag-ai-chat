-- CreateEnum
CREATE TYPE "EvalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "eval_questions" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "expected_answer" TEXT NOT NULL DEFAULT '',
    "chunk_id" TEXT,
    "document_id" TEXT,
    "must_refuse" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL DEFAULT 'prose',
    "status" "EvalStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eval_questions_status_idx" ON "eval_questions"("status");
