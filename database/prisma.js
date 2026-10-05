const { PrismaClient } = require("@prisma/client");

const globalForPrisma = global;

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// Extension to automatically auto-increment recver on every update
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async update({ model, operation, args, query }) {
        if (args.data && args.data.recver === undefined) {
          args.data = {
            ...args.data,
            recver: { increment: 1 },
          };
        }
        return query(args);
      },
      async updateMany({ model, operation, args, query }) {
        if (args.data && args.data.recver === undefined) {
          args.data = {
            ...args.data,
            recver: { increment: 1 },
          };
        }
        return query(args);
      },
      async upsert({ model, operation, args, query }) {
        if (args.update && args.update.recver === undefined) {
          args.update = {
            ...args.update,
            recver: { increment: 1 },
          };
        }
        return query(args);
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

module.exports = { prisma };
