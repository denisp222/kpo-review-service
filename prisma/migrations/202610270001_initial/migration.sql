CREATE TYPE "WorkStatus" AS ENUM ('submitted', 'reviewed', 'rejected');
CREATE TABLE "Work" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "status" "WorkStatus" NOT NULL DEFAULT 'submitted',
  "grade" INTEGER,
  "comment" TEXT,
  "recommendations" TEXT,
  CONSTRAINT "Work_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Work_grade_range" CHECK ("grade" BETWEEN 0 AND 100)
);
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Notification_studentId_idx" ON "Notification"("studentId");
