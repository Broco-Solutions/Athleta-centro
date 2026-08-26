-- CreateEnum
CREATE TYPE "SalaWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "SalaScheduleExceptionType" AS ENUM ('CLOSURE', 'CAPACITY_OVERRIDE');

-- CreateTable
CREATE TABLE "sala_configuration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "general_capacity" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sala_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sala_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_amount" DECIMAL(14,0) NOT NULL,
    "is_selectable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sala_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sala_schedule_slots" (
    "id" UUID NOT NULL,
    "weekday" "SalaWeekday" NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "specific_capacity" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sala_schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sala_schedule_exceptions" (
    "id" UUID NOT NULL,
    "schedule_slot_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "SalaScheduleExceptionType" NOT NULL,
    "capacity_override" INTEGER,

    CONSTRAINT "sala_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sala_schedule_slots_weekday_start_time_key" ON "sala_schedule_slots"("weekday", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "sala_schedule_exceptions_schedule_slot_id_date_key" ON "sala_schedule_exceptions"("schedule_slot_id", "date");

-- AddForeignKey
ALTER TABLE "sala_schedule_exceptions" ADD CONSTRAINT "sala_schedule_exceptions_schedule_slot_id_fkey" FOREIGN KEY ("schedule_slot_id") REFERENCES "sala_schedule_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sala_configuration" ADD CONSTRAINT "sala_configuration_general_capacity_positive" CHECK ("general_capacity" > 0);
ALTER TABLE "sala_plans" ADD CONSTRAINT "sala_plans_monthly_amount_non_negative" CHECK ("monthly_amount" >= 0);
ALTER TABLE "sala_schedule_slots" ADD CONSTRAINT "sala_schedule_slots_duration_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "sala_schedule_slots" ADD CONSTRAINT "sala_schedule_slots_specific_capacity_positive" CHECK ("specific_capacity" IS NULL OR "specific_capacity" > 0);
ALTER TABLE "sala_schedule_exceptions" ADD CONSTRAINT "sala_schedule_exceptions_capacity_positive" CHECK ("capacity_override" IS NULL OR "capacity_override" > 0);
