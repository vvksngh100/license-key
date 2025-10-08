const { pool } = require("../database/db");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const UAParser = require("ua-parser-js");

function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(16);
  let serial = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) serial += "-";
    serial += chars[bytes[i] % chars.length];
  }
  return serial;
}

const generateSerialKey = async (req, res) => {
  const maxTries = 5;
  const {
    email,
    company_name,
    contact_person,
    phone,
    address,
    country,
    product_version,
    license_type,
  } = req.body;
  const { user_id } = req.user;
  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",").shift() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  const parser = new UAParser(userAgent);
  const uaResult = parser.getResult();

  const browserName = uaResult.browser.name || null;
  const browserVersion = uaResult.browser.version || null;
  const operatingSystem = uaResult.os.name || null;
  const deviceType = uaResult.device.type || "desktop";

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const connection = await pool.getConnection();
    try {
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();

      //   Insert the customer record.
      const customerId = uuidv4();
      await connection.execute(
        `INSERT INTO customers (customer_id, email, company_name, contact_person, phone, address, country, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          email,
          company_name,
          contact_person,
          phone,
          address,
          country,
          user_id,
          user_id,
        ]
      );

      //   Insert the licenses record.
      const serialKey = generateKey();
      const licenseId = uuidv4();
      await connection.execute(
        `INSERT INTO licenses (license_id, serial_key, customer_id, product_version, license_type, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId,
          serialKey,
          customerId,
          product_version,
          license_type || "trial",
          user_id,
          user_id,
        ]
      );

      //   Insert the license_audit_log record.
      const logId = uuidv4();
      await connection.execute(
        `INSERT INTO license_audit_log (
            log_id, user_id, license_id, action_type, action_details, 
            ip_address, user_agent, browser_name, browser_version, operating_system, device_type
          )
         VALUES (?, ?, ?, ?, JSON_OBJECT('info', 'License created successfully'), ?, ?, ?, ?, ?, ?)`,
        [
          logId,
          user_id || null,
          licenseId,
          "CREATE",
          ipAddress,
          userAgent,
          browserName,
          browserVersion,
          operatingSystem,
          deviceType,
        ]
      );

      await connection.commit();
      return res.status(200).json({
        status: true,
        message: "Serial key generated successfully",
        serialKey,
        attempt,
      });
    } catch (error) {
      await connection.rollback();

      if (error.code === "ER_DUP_ENTRY" && attempt < maxTries) {
        console.warn(`Duplicate key on attempt ${attempt}, retrying...`);
        continue;
      }

      console.error("Transaction failed:", error);
      return res.status(500).json({
        status: false,
        message: "Transaction failed",
        error: error.message,
        attempt,
      });
    } finally {
      connection.release();
    }
  }

  return res.status(500).json({
    status: false,
    message: "Failed to complete transaction after multiple attempts",
  });
};

module.exports = { generateSerialKey };
