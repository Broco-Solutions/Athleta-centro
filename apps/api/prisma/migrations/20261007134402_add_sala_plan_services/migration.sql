-- CreateTable
CREATE TABLE "sala_plan_services" (
    "plan_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,

    CONSTRAINT "sala_plan_services_pkey" PRIMARY KEY ("plan_id","service_type_id")
);

-- CreateIndex
CREATE INDEX "sala_plan_services_service_type_id_idx" ON "sala_plan_services"("service_type_id");

-- AddForeignKey
ALTER TABLE "sala_plan_services" ADD CONSTRAINT "sala_plan_services_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sala_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sala_plan_services" ADD CONSTRAINT "sala_plan_services_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "sala_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
