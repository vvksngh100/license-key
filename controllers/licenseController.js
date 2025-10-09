const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pool } = require("../database/db");


const registerLicense = async (req, res) => {
  const maxTries = 5;

  try {
    const { mac_address, serial_key, device_name, ip_address } = req.body;

    // Validate required fields
    if (!mac_address || !serial_key || !device_name || !ip_address) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields",
      });
    }

    // Check for serial key validity
    const [licenseData] = await pool.execute(
      `SELECT * FROM licenses WHERE serial_key = ?`,
      [serial_key]
    );

    if (licenseData.length === 0) {
      return res.status(401).json({
        status: false,
        message: "Invalid Serial key",
      });
    }

    const license = licenseData[0];
    if (license.status !== "inactive" || license.activation_date !== null) {
      return res.status(401).json({
        status: false,
        message: "Serial key is already activated",
      });
    }

    const license_id = license.license_id;

    // Build license payload
    const licensePayload = {
      serial_key,
      mac_address,
      issued_at: new Date().toISOString(),
    };
    const licenseJson = JSON.stringify(licensePayload);

    // Sign data using private key
    const privateKeyPath = path.join(__dirname, "../keys/private.pem");

    if (!fs.existsSync(privateKeyPath)) {
      console.error("Private key file not found at:", privateKeyPath);
      return res.status(500).json({
        status: false,
        message: "License signing key is missing on server",
      });
    }

    const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(licenseJson);
    signer.end();

    const signature = signer.sign(privateKey, "base64");

    // Build .ini formatted content
    const iniContent = `[License]\ndata=${Buffer.from(licenseJson).toString(
      "base64"
    )}\nsignature=${signature}\n`;

    // Database transaction with retry
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const connection = await pool.getConnection();
      try {
        await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await connection.beginTransaction();

        // Current date and time
        const currentDate = new Date().toISOString().replace('T', ' ').replace('Z','');

        // Insert into activations
        await connection.execute(
          `INSERT INTO activations 
          (license_id, mac_address, device_name, ip_address, activated_at, last_validation, encrypted_key)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            license_id,
            mac_address,
            device_name,
            ip_address,
            currentDate,
            currentDate,
            iniContent,
          ]
        );

        // Update license status
        await connection.execute(
          `UPDATE licenses SET activation_date = ?, status = ? WHERE license_id = ?`,
          [currentDate, "active", license_id]
        );

        await connection.commit();

        // Success response with .ini content
        return res.status(200).json({
          status: true,
          message: "Device registered successfully",
          iniContent,
          attempt,
        });
      } catch (error) {
        await connection.rollback();

        if (error.code === "ER_DUP_ENTRY" && attempt < maxTries) {
          console.warn(`Duplicate entry on attempt ${attempt}, retrying...`);
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

    // If all attempts failed
    return res.status(500).json({
      status: false,
      message: "Failed to complete transaction after multiple attempts",
    });
  } catch (error) {
    console.error("Outer error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = { registerLicense };
