/**
 * Seed: создаёт первого администратора из SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 * Идемпотентно (upsert). Публичной регистрации нет — дальше клиентов заводит админ.
 * Запуск: pnpm --filter @rag/api seed
 */
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL и SEED_ADMIN_PASSWORD обязательны (см. .env.example).",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      role: Role.admin,
      status: UserStatus.active,
    },
  });

  console.log(`✓ Админ готов: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
