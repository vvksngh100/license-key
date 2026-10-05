const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { logger } = require("../utils/logger");

function validateEnvironment() {
  const missingVars = [];

  const requiredVariables = [
    "DATABASE_URL",
    "JWT_SECRET",
    "PRIVATE_KEY",
  ];

  for (const varName of requiredVariables) {
    if (!process.env[varName] || process.env[varName].trim() === "") {
      missingVars.push(varName);
    }
  }

  // Validate RSA Private Key format
  if (process.env.PRIVATE_KEY) {
    try {
      const decodedKey = Buffer.from(process.env.PRIVATE_KEY, "base64").toString("utf-8");
      if (
        !decodedKey.includes("-----BEGIN PRIVATE KEY-----") &&
        !decodedKey.includes("-----BEGIN RSA PRIVATE KEY-----")
      ) {
        logger.fatal("FATAL: PRIVATE_KEY does not contain a valid RSA PEM private key header.");
        process.exit(1);
      }
    } catch (e) {
      logger.fatal("FATAL: Failed to decode Base64 PRIVATE_KEY: " + e.message);
      process.exit(1);
    }
  }

  if (missingVars.length > 0) {
    logger.fatal(
      `FATAL: Missing required environment variable(s): [${missingVars.join(", ")}]. Please define them in .env`
    );
    process.exit(1);
  }

  logger.info("Environment configuration validated successfully.");
}

module.exports = { validateEnvironment };
