import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"], // 개발 환경에서도 error만 표시
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export default db;

