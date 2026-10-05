const crypto = require("crypto");
const { prisma } = require("../database/prisma");
const UAParser = require("ua-parser-js");
require("dotenv").config();

/**
 * Helper to get clean private key from environment
 */
function getPrivateKey() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is missing on server");
  }

  let privateKey = Buffer.from(process.env.PRIVATE_KEY, "base64").toString("utf-8");
  if (
    !privateKey.includes("-----BEGIN PRIVATE KEY-----") &&
    !privateKey.includes("-----BEGIN RSA PRIVATE KEY-----")
  ) {
    throw new Error("Invalid private key format");
  }
  return privateKey;
}

/**
 * Helper to sign license payload and construct .ini format
 */
function createSignedIni(payload, privateKey) {
  const licenseJson = JSON.stringify(payload);
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(licenseJson);
  signer.end();
  const signature = signer.sign(privateKey, "base64");

  return `[License]\ndata=${Buffer.from(licenseJson).toString("base64")}\nsignature=${signature}\n`;
}

/**
 * Extract client metadata
 */
function getClientMeta(req) {
  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",").shift()?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  const parser = new UAParser(userAgent);
  const uaResult = parser.getResult();

  return {
    ipAddress,
    userAgent,
    browserName: uaResult.browser.name || null,
    browserVersion: uaResult.browser.version || null,
    operatingSystem: uaResult.os.name || null,
    deviceType: uaResult.device.type || "desktop",
  };
}

/**
 * Client Device Hardware Registration & Activation
 * POST /api/auth/register-license
 */
const registerLicense = async (req, res) => {
  const maxTries = 5;

  try {
    const { mac_address, hwid, serial_key, device_name } = req.body;
    const clientMeta = getClientMeta(req);
    const ipAddress = req.body.ip_address || clientMeta.ipAddress;

    // Validate required fields
    if (!mac_address || !serial_key || !device_name) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: mac_address, serial_key, and device_name are mandatory",
      });
    }

    // Decode private key
    let privateKey;
    try {
      privateKey = getPrivateKey();
    } catch (err) {
      console.error("Private key error:", err.message);
      return res.status(500).json({
        status: false,
        message: "License signing key configuration error on server",
      });
    }

    // Find license in database
    const license = await prisma.license.findUnique({
      where: { serialKey: serial_key.trim() },
      include: {
        activations: true,
      },
    });

    if (!license) {
      return res.status(404).json({
        status: false,
        message: "Invalid serial key",
      });
    }

    // 1. Check if license is revoked
    if (license.status === "revoked") {
      return res.status(403).json({
        status: false,
        message: "This license has been revoked by the administrator",
      });
    }

    // 2. Check if license has expired
    const now = new Date();
    if (license.expiresAt && new Date(license.expiresAt) < now) {
      return res.status(403).json({
        status: false,
        message: `This license expired on ${new Date(license.expiresAt).toLocaleDateString()}`,
      });
    }

    // 3. RE-ACTIVATION CHECK: Check if this device is ALREADY registered under this license
    const normalizedMac = mac_address.toUpperCase().trim();
    const existingDeviceActivation = license.activations.find(
      (a) =>
        a.macAddress.toUpperCase() === normalizedMac ||
        (hwid && a.hwid && a.hwid === hwid)
    );

    if (existingDeviceActivation && existingDeviceActivation.isActive) {
      // Re-issue / restore existing activation without burning a new slot
      await prisma.activation.update({
        where: { activationId: existingDeviceActivation.activationId },
        data: {
          lastValidation: now,
          ipAddress,
          deviceName: device_name || existingDeviceActivation.deviceName,
        },
      });

      // Log re-activation event
      await prisma.licenseAuditLog.create({
        data: {
          licenseId: license.licenseId,
          actionType: "REACTIVATION",
          actionDetails: {
            info: "Device re-activated existing license slot",
            mac_address: normalizedMac,
            hwid: hwid || null,
            device_name,
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
          browserName: clientMeta.browserName,
          browserVersion: clientMeta.browserVersion,
          operatingSystem: clientMeta.operatingSystem,
          deviceType: clientMeta.deviceType,
        },
      });

      return res.status(200).json({
        status: true,
        message: "Device already registered. License restored successfully.",
        iniContent: existingDeviceActivation.encryptedKey,
        isReactivation: true,
      });
    }

    // 4. MULTI-DEVICE LIMIT CHECK: Count active devices
    const activeDeviceCount = license.activations.filter((a) => a.isActive).length;
    if (activeDeviceCount >= license.maxDevices) {
      return res.status(403).json({
        status: false,
        message: `Maximum allowed devices (${license.maxDevices}) reached for this license. Please contact support or upgrade your plan.`,
        activeDevices: activeDeviceCount,
        maxDevices: license.maxDevices,
      });
    }

    // 5. Construct payload & sign
    const licensePayload = {
      serial_key: license.serialKey,
      mac_address: normalizedMac,
      hwid: hwid || null,
      license_type: license.licenseType,
      product_version: license.productVersion,
      issued_at: now.toISOString(),
      expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
    };

    const iniContent = createSignedIni(licensePayload, privateKey);

    // 6. Transaction with retry for atomic activation
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          // If the device existed before but was deactivated, reactivate it; otherwise create new
          if (existingDeviceActivation && !existingDeviceActivation.isActive) {
            await tx.activation.update({
              where: { activationId: existingDeviceActivation.activationId },
              data: {
                isActive: true,
                deviceName,
                ipAddress,
                hwid: hwid || existingDeviceActivation.hwid,
                activatedAt: now,
                lastValidation: now,
                encryptedKey: iniContent,
              },
            });
          } else {
            await tx.activation.create({
              data: {
                licenseId: license.licenseId,
                macAddress: normalizedMac,
                hwid: hwid || null,
                deviceName,
                ipAddress,
                activatedAt: now,
                lastValidation: now,
                encryptedKey: iniContent,
                isActive: true,
              },
            });
          }

          // Update license activation date and status to active
          await tx.license.update({
            where: { licenseId: license.licenseId },
            data: {
              activationDate: license.activationDate || now,
              status: "active",
            },
          });

          // Insert activation audit log
          await tx.licenseAuditLog.create({
            data: {
              licenseId: license.licenseId,
              actionType: "ACTIVATION",
              actionDetails: {
                info: "New device activated license",
                mac_address: normalizedMac,
                hwid: hwid || null,
                device_name,
                active_devices_now: activeDeviceCount + 1,
                max_devices: license.maxDevices,
              },
              ipAddress: clientMeta.ipAddress,
              userAgent: clientMeta.userAgent,
              browserName: clientMeta.browserName,
              browserVersion: clientMeta.browserVersion,
              operatingSystem: clientMeta.operatingSystem,
              deviceType: clientMeta.deviceType,
            },
          });
        });

        return res.status(200).json({
          status: true,
          message: "Device registered and license activated successfully",
          iniContent,
          expiresAt: license.expiresAt,
          attempt,
        });
      } catch (error) {
        if (error.code === "P2002" && attempt < maxTries) {
          console.warn(`Duplicate entry on attempt ${attempt}, retrying...`);
          continue;
        }

        console.error("Activation transaction error:", error);
        return res.status(500).json({
          status: false,
          message: "Database transaction failed",
          error: error.message,
          attempt,
        });
      }
    }

    return res.status(500).json({
      status: false,
      message: "Failed to complete license activation after multiple attempts",
    });
  } catch (error) {
    console.error("registerLicense error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * Periodic Heartbeat & Online Validation
 * POST /api/auth/validate-license
 */
const validateLicense = async (req, res) => {
  try {
    const { serial_key, mac_address, hwid } = req.body;
    const clientMeta = getClientMeta(req);

    if (!serial_key || !mac_address) {
      return res.status(400).json({
        status: false,
        message: "serial_key and mac_address are mandatory for validation",
      });
    }

    const normalizedMac = mac_address.toUpperCase().trim();

    const license = await prisma.license.findUnique({
      where: { serialKey: serial_key.trim() },
      include: {
        activations: true,
      },
    });

    if (!license) {
      return res.status(404).json({
        status: false,
        valid: false,
        message: "License not found",
      });
    }

    if (license.status === "revoked") {
      return res.status(403).json({
        status: false,
        valid: false,
        message: "License has been revoked",
      });
    }

    const now = new Date();
    if (license.expiresAt && new Date(license.expiresAt) < now) {
      return res.status(403).json({
        status: false,
        valid: false,
        message: "License has expired",
        expiresAt: license.expiresAt,
      });
    }

    // Check device match
    const activation = license.activations.find(
      (a) =>
        a.macAddress.toUpperCase() === normalizedMac ||
        (hwid && a.hwid && a.hwid === hwid)
    );

    if (!activation || !activation.isActive) {
      return res.status(403).json({
        status: false,
        valid: false,
        message: "This device is not an active authorized device for this license",
      });
    }

    // Update last validation timestamp and IP
    await prisma.activation.update({
      where: { activationId: activation.activationId },
      data: {
        lastValidation: now,
        ipAddress: clientMeta.ipAddress || activation.ipAddress,
      },
    });

    return res.status(200).json({
      status: true,
      valid: true,
      message: "License is active and valid",
      licenseType: license.licenseType,
      expiresAt: license.expiresAt,
    });
  } catch (error) {
    console.error("validateLicense error:", error);
    return res.status(500).json({
      status: false,
      message: "Validation service error",
      error: error.message,
    });
  }
};

/**
 * Admin Revoke Entire License
 * POST /api/auth/revoke-license
 */
const revokeLicense = async (req, res) => {
  try {
    const { serial_key, license_id, reason } = req.body;
    const userId = req.user?.user_id || req.user?.userId || null;
    const clientMeta = getClientMeta(req);

    if (!serial_key && !license_id) {
      return res.status(400).json({
        status: false,
        message: "Either serial_key or license_id is required",
      });
    }

    const license = await prisma.license.findFirst({
      where: serial_key ? { serialKey: serial_key.trim() } : { licenseId: license_id },
    });

    if (!license) {
      return res.status(404).json({
        status: false,
        message: "License not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark license as revoked
      await tx.license.update({
        where: { licenseId: license.licenseId },
        data: {
          status: "revoked",
          updatedBy: userId,
        },
      });

      // 2. Deactivate all device activations
      await tx.activation.updateMany({
        where: { licenseId: license.licenseId },
        data: { isActive: false },
      });

      // 3. Log revocation audit
      await tx.licenseAuditLog.create({
        data: {
          userId,
          licenseId: license.licenseId,
          actionType: "REVOKE",
          actionDetails: {
            reason: reason || "Revoked by admin",
            revoked_by: userId,
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
          browserName: clientMeta.browserName,
          browserVersion: clientMeta.browserVersion,
          operatingSystem: clientMeta.operatingSystem,
          deviceType: clientMeta.deviceType,
        },
      });
    });

    return res.status(200).json({
      status: true,
      message: `License ${license.serialKey} has been revoked successfully`,
    });
  } catch (error) {
    console.error("revokeLicense error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to revoke license",
      error: error.message,
    });
  }
};

/**
 * Admin Deactivate a Single Device (Release seat)
 * POST /api/auth/deactivate-device
 */
const deactivateDevice = async (req, res) => {
  try {
    const { activation_id, reason } = req.body;
    const userId = req.user?.user_id || req.user?.userId || null;
    const clientMeta = getClientMeta(req);

    if (!activation_id) {
      return res.status(400).json({
        status: false,
        message: "activation_id is required",
      });
    }

    const activation = await prisma.activation.findUnique({
      where: { activationId: activation_id },
    });

    if (!activation) {
      return res.status(404).json({
        status: false,
        message: "Activation record not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.activation.update({
        where: { activationId: activation_id },
        data: { isActive: false },
      });

      await tx.licenseAuditLog.create({
        data: {
          userId,
          licenseId: activation.licenseId,
          actionType: "DEACTIVATE_DEVICE",
          actionDetails: {
            activation_id,
            mac_address: activation.macAddress,
            reason: reason || "Device deactivated by admin",
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
          browserName: clientMeta.browserName,
          browserVersion: clientMeta.browserVersion,
          operatingSystem: clientMeta.operatingSystem,
          deviceType: clientMeta.deviceType,
        },
      });
    });

    return res.status(200).json({
      status: true,
      message: `Device ${activation.macAddress} has been deactivated. License slot released.`,
    });
  } catch (error) {
    console.error("deactivateDevice error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to deactivate device",
      error: error.message,
    });
  }
};

module.exports = {
  registerLicense,
  validateLicense,
  revokeLicense,
  deactivateDevice,
};