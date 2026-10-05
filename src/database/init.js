const { prisma } = require("./prisma");
const { seedDatabase } = require("./seed");

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL is not configured in .env. Skipping database initialization.");
    return;
  }

  try {
    console.log("Testing PostgreSQL database connection...");
    await prisma.$connect();
    console.log("Connected to PostgreSQL successfully via Prisma");

    // Seed initial users if needed
    await seedDatabase();
  } catch (error) {
    console.warn("⚠️ Database connection/initialization warning:", error.message);
  }
}

module.exports = { initializeDatabase };