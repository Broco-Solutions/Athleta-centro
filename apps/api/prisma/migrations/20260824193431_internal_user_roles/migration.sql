-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PROFESSOR', 'KINESIOLOGIST', 'OSTEOPATH', 'ADMINISTRATIVE', 'GENERAL_ADMIN', 'BROCO_SUPPORT');

-- CreateEnum
CREATE TYPE "InternalUserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "internal_users" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalized_email" TEXT NOT NULL,
    "status" "InternalUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_user_roles" (
    "internal_user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "internal_user_roles_pkey" PRIMARY KEY ("internal_user_id","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_users_normalized_email_key" ON "internal_users"("normalized_email");

-- AddForeignKey
ALTER TABLE "internal_user_roles" ADD CONSTRAINT "internal_user_roles_internal_user_id_fkey" FOREIGN KEY ("internal_user_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
