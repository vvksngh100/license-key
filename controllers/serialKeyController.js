const { prisma } = require("../database/prisma");
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
    validity_days,
    max_devices,
  } = req.body;

  // Basic validation
  if (!email) {
    return res.status(400).json({
      status: false,
      message: "Customer email is required",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      status: false,
      message: "Invalid email format",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const selectedLicenseType = license_type === "enterprise" ? "enterprise" : "trial";
  
  // Set default validity days if not specified: 30 days for trial, 365 days for enterprise
  const parsedValidityDays = validity_days ? parseInt(validity_days, 10) : (selectedLicenseType === "trial" ? 30 : 365);
  const parsedMaxDevices = max_devices ? Math.max(1, parseInt(max_devices, 10)) : 1;

  // Compute expiration date
  const expiresAt = new Date(Date.now() + parsedValidityDays * 24 * 60 * 60 * 1000);

  const userId = req.user?.user_id || req.user?.userId || null;
  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",").shift()?.trim() ||
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
    try {
      const serialKey = generateKey();

      const result = await prisma.$transaction(async (tx) => {
        // 1. Customer deduplication: find existing or create new
        let customer = await tx.customer.findFirst({
          where: { email: normalizedEmail },
        });

        if (!customer) {
          customer = await tx.customer.create({
            data: {
              email: normalizedEmail,
              companyName: company_name || null,
              contactPerson: contact_person || null,
              phone: phone || null,
              address: address || null,
              country: country || null,
              createdBy: userId,
              updatedBy: userId,
            },
          });
        } else {
          // Update customer metadata if new details were provided
          customer = await tx.customer.update({
            where: { customerId: customer.customerId },
            data: {
              companyName: company_name || customer.companyName,
              contactPerson: contact_person || customer.contactPerson,
              phone: phone || customer.phone,
              address: address || customer.address,
              country: country || customer.country,
              updatedBy: userId,
            },
          });
        }

        // 2. Insert license record with expiration and max devices
        const license = await tx.license.create({
          data: {
            serialKey,
            customerId: customer.customerId,
            productVersion: product_version || "1.0.0",
            licenseType: selectedLicenseType,
            validityDays: parsedValidityDays,
            expiresAt,
            maxDevices: parsedMaxDevices,
            createdBy: userId,
            updatedBy: userId,
          },
        });

        // 3. Insert license audit log
        await tx.licenseAuditLog.create({
          data: {
            userId,
            licenseId: license.licenseId,
            actionType: "CREATE",
            actionDetails: {
              info: "License generated successfully",
              license_type: selectedLicenseType,
              validity_days: parsedValidityDays,
              max_devices: parsedMaxDevices,
              expires_at: expiresAt.toISOString(),
            },
            ipAddress,
            userAgent,
            browserName,
            browserVersion,
            operatingSystem,
            deviceType,
          },
        });

        return {
          serialKey,
          customerId: customer.customerId,
          licenseId: license.licenseId,
          expiresAt,
          maxDevices: parsedMaxDevices,
        };
      });

      return res.status(200).json({
        status: true,
        message: "Serial key generated successfully",
        serialKey: result.serialKey,
        licenseId: result.licenseId,
        expiresAt: result.expiresAt,
        maxDevices: result.maxDevices,
        attempt,
      });
    } catch (error) {
      if (error.code === "P2002" && attempt < maxTries) {
        console.warn(`Duplicate key on attempt ${attempt}, retrying...`);
        continue;
      }

      console.error("Serial key generation transaction failed:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to generate serial key",
        error: error.message,
        attempt,
      });
    }
  }

  return res.status(500).json({
    status: false,
    message: "Failed to complete transaction after multiple attempts",
  });
};

module.exports = { generateSerialKey };
