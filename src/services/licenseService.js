const crypto = require("crypto");
const { LicenseRepository } = require("../repositories/licenseRepository");
const { CustomerRepository } = require("../repositories/customerRepository");
const { RsaLicenseSigner } = require("../crypto/rsaLicenseSigner");

class LicenseService {
  constructor(
    licenseRepository = new LicenseRepository(),
    customerRepository = new CustomerRepository(),
    licenseSigner = new RsaLicenseSigner()
  ) {
    this.licenseRepo = licenseRepository;
    this.customerRepo = customerRepository;
    this.signer = licenseSigner;
  }

  /**
   * Generates a 16-character license key format: XXXX-XXXX-XXXX-XXXX
   */
  generateKeyString() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = crypto.randomBytes(16);
    let serial = "";
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) serial += "-";
      serial += chars[bytes[i] % chars.length];
    }
    return serial;
  }

  /**
   * Issues a serial key, performs customer deduplication, and writes audit record
   */
  async generateSerialKey({
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
    userId,
    meta = {},
  }) {
    if (!email) {
      const err = new Error("Customer email is required");
      err.statusCode = 400;
      throw err;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const err = new Error("Invalid email format");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const selectedLicenseType = license_type === "enterprise" ? "enterprise" : "trial";
    const parsedValidityDays = validity_days
      ? parseInt(validity_days, 10)
      : selectedLicenseType === "trial"
      ? 30
      : 365;
    const parsedMaxDevices = max_devices ? Math.max(1, parseInt(max_devices, 10)) : 1;
    const expiresAt = new Date(Date.now() + parsedValidityDays * 24 * 60 * 60 * 1000);

    return this.licenseRepo.runTransaction(async (tx) => {
      // 1. Customer deduplication
      let customer = await this.customerRepo.findByEmail(normalizedEmail, tx);

      if (!customer) {
        customer = await this.customerRepo.create(
          {
            email: normalizedEmail,
            companyName: company_name || null,
            contactPerson: contact_person || null,
            phone: phone || null,
            address: address || null,
            country: country || null,
            createdBy: userId,
            updatedBy: userId,
          },
          tx
        );
      } else {
        customer = await this.customerRepo.update(
          customer.customerId,
          {
            companyName: company_name || customer.companyName,
            contactPerson: contact_person || customer.contactPerson,
            phone: phone || customer.phone,
            address: address || customer.address,
            country: country || customer.country,
            updatedBy: userId,
          },
          tx
        );
      }

      // 2. Create license
      const serialKey = this.generateKeyString();
      const license = await this.licenseRepo.create(
        {
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
        tx
      );

      // 3. Create audit log
      await this.licenseRepo.createAuditLog(
        {
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
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          browserName: meta.browserName,
          browserVersion: meta.browserVersion,
          operatingSystem: meta.operatingSystem,
          deviceType: meta.deviceType,
        },
        tx
      );

      return {
        serialKey,
        licenseId: license.licenseId,
        expiresAt,
        maxDevices: parsedMaxDevices,
      };
    });
  }

  /**
   * Activates device hardware or recovers existing activation slot
   */
  async registerLicense({ mac_address, hwid, serial_key, device_name, ip_address, meta = {} }) {
    if (!mac_address || !serial_key || !device_name) {
      const err = new Error("mac_address, serial_key, and device_name are mandatory");
      err.statusCode = 400;
      throw err;
    }

    const license = await this.licenseRepo.findBySerialKey(serial_key.trim(), {
      includeActivations: true,
    });

    if (!license) {
      const err = new Error("Invalid serial key");
      err.statusCode = 404;
      throw err;
    }

    if (license.status === "revoked") {
      const err = new Error("This license has been revoked by the administrator");
      err.statusCode = 403;
      throw err;
    }

    const now = new Date();
    if (license.expiresAt && new Date(license.expiresAt) < now) {
      const err = new Error(`This license expired on ${new Date(license.expiresAt).toLocaleDateString()}`);
      err.statusCode = 403;
      throw err;
    }

    const normalizedMac = mac_address.toUpperCase().trim();
    const effectiveIp = ip_address || meta.ipAddress;

    // Check for re-activation (known device)
    const existingActivation = license.activations.find(
      (a) =>
        a.macAddress.toUpperCase() === normalizedMac ||
        (hwid && a.hwid && a.hwid === hwid)
    );

    if (existingActivation && existingActivation.isActive) {
      await this.licenseRepo.updateActivation(existingActivation.activationId, {
        lastValidation: now,
        ipAddress: effectiveIp,
        deviceName: device_name || existingActivation.deviceName,
      });

      await this.licenseRepo.createAuditLog({
        licenseId: license.licenseId,
        actionType: "REACTIVATION",
        actionDetails: {
          info: "Device re-activated existing license slot",
          mac_address: normalizedMac,
          hwid: hwid || null,
          device_name,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        browserName: meta.browserName,
        browserVersion: meta.browserVersion,
        operatingSystem: meta.operatingSystem,
        deviceType: meta.deviceType,
      });

      return {
        isReactivation: true,
        message: "Device already registered. License restored successfully.",
        iniContent: existingActivation.encryptedKey,
        expiresAt: license.expiresAt,
      };
    }

    // Check device seat limit
    const activeDeviceCount = license.activations.filter((a) => a.isActive).length;
    if (activeDeviceCount >= license.maxDevices) {
      const err = new Error(
        `Maximum allowed devices (${license.maxDevices}) reached for this license. Please contact support or upgrade your plan.`
      );
      err.statusCode = 403;
      throw err;
    }

    // Generate cryptographic payload & sign using injected signer (OCP & LSP)
    const licensePayload = {
      serial_key: license.serialKey,
      mac_address: normalizedMac,
      hwid: hwid || null,
      license_type: license.licenseType,
      product_version: license.productVersion,
      issued_at: now.toISOString(),
      expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
    };

    const iniContent = this.signer.sign(licensePayload);

    return this.licenseRepo.runTransaction(async (tx) => {
      if (existingActivation && !existingActivation.isActive) {
        await this.licenseRepo.updateActivation(
          existingActivation.activationId,
          {
            isActive: true,
            deviceName,
            ipAddress: effectiveIp,
            hwid: hwid || existingActivation.hwid,
            activatedAt: now,
            lastValidation: now,
            encryptedKey: iniContent,
          },
          tx
        );
      } else {
        await this.licenseRepo.createActivation(
          {
            licenseId: license.licenseId,
            macAddress: normalizedMac,
            hwid: hwid || null,
            deviceName,
            ipAddress: effectiveIp,
            activatedAt: now,
            lastValidation: now,
            encryptedKey: iniContent,
            isActive: true,
          },
          tx
        );
      }

      await this.licenseRepo.update(
        license.licenseId,
        {
          activationDate: license.activationDate || now,
          status: "active",
        },
        tx
      );

      await this.licenseRepo.createAuditLog(
        {
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
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          browserName: meta.browserName,
          browserVersion: meta.browserVersion,
          operatingSystem: meta.operatingSystem,
          deviceType: meta.deviceType,
        },
        tx
      );

      return {
        isReactivation: false,
        message: "Device registered and license activated successfully",
        iniContent,
        expiresAt: license.expiresAt,
      };
    });
  }

  /**
   * Periodic online heartbeat check
   */
  async validateLicense({ serial_key, mac_address, hwid, meta = {} }) {
    if (!serial_key || !mac_address) {
      const err = new Error("serial_key and mac_address are mandatory for validation");
      err.statusCode = 400;
      throw err;
    }

    const license = await this.licenseRepo.findBySerialKey(serial_key.trim(), {
      includeActivations: true,
    });

    if (!license) {
      const err = new Error("License not found");
      err.statusCode = 404;
      throw err;
    }

    if (license.status === "revoked") {
      const err = new Error("License has been revoked");
      err.statusCode = 403;
      throw err;
    }

    const now = new Date();
    if (license.expiresAt && new Date(license.expiresAt) < now) {
      const err = new Error("License has expired");
      err.statusCode = 403;
      throw err;
    }

    const normalizedMac = mac_address.toUpperCase().trim();
    const activation = license.activations.find(
      (a) =>
        a.macAddress.toUpperCase() === normalizedMac ||
        (hwid && a.hwid && a.hwid === hwid)
    );

    if (!activation || !activation.isActive) {
      const err = new Error("This device is not an active authorized device for this license");
      err.statusCode = 403;
      throw err;
    }

    await this.licenseRepo.updateActivation(activation.activationId, {
      lastValidation: now,
      ipAddress: meta.ipAddress || activation.ipAddress,
    });

    return {
      valid: true,
      licenseType: license.licenseType,
      expiresAt: license.expiresAt,
    };
  }

  /**
   * Revoke license and deactivate all device seats
   */
  async revokeLicense({ serial_key, license_id, reason, userId, meta = {} }) {
    if (!serial_key && !license_id) {
      const err = new Error("Either serial_key or license_id is required");
      err.statusCode = 400;
      throw err;
    }

    const license = serial_key
      ? await this.licenseRepo.findBySerialKey(serial_key.trim())
      : await this.licenseRepo.findById(license_id);

    if (!license) {
      const err = new Error("License not found");
      err.statusCode = 404;
      throw err;
    }

    return this.licenseRepo.runTransaction(async (tx) => {
      await this.licenseRepo.update(
        license.licenseId,
        {
          status: "revoked",
          updatedBy: userId,
        },
        tx
      );

      await this.licenseRepo.deactivateAllForLicense(license.licenseId, tx);

      await this.licenseRepo.createAuditLog(
        {
          userId,
          licenseId: license.licenseId,
          actionType: "REVOKE",
          actionDetails: {
            reason: reason || "Revoked by admin",
            revoked_by: userId,
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          browserName: meta.browserName,
          browserVersion: meta.browserVersion,
          operatingSystem: meta.operatingSystem,
          deviceType: meta.deviceType,
        },
        tx
      );

      return {
        serialKey: license.serialKey,
      };
    });
  }

  /**
   * Deactivates a single device activation
   */
  async deactivateDevice({ activation_id, reason, userId, meta = {} }) {
    if (!activation_id) {
      const err = new Error("activation_id is required");
      err.statusCode = 400;
      throw err;
    }

    const activation = await this.licenseRepo.findActivationById(activation_id);
    if (!activation) {
      const err = new Error("Activation record not found");
      err.statusCode = 404;
      throw err;
    }

    return this.licenseRepo.runTransaction(async (tx) => {
      await this.licenseRepo.updateActivation(
        activation_id,
        { isActive: false },
        tx
      );

      await this.licenseRepo.createAuditLog(
        {
          userId,
          licenseId: activation.licenseId,
          actionType: "DEACTIVATE_DEVICE",
          actionDetails: {
            activation_id,
            mac_address: activation.macAddress,
            reason: reason || "Device deactivated by admin",
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          browserName: meta.browserName,
          browserVersion: meta.browserVersion,
          operatingSystem: meta.operatingSystem,
          deviceType: meta.deviceType,
        },
        tx
      );

      return {
        macAddress: activation.macAddress,
      };
    });
  }
}

module.exports = { LicenseService };
