const { LicenseService } = require("../services/licenseService");
const { extractClientMeta } = require("../utils/clientMeta");

const defaultLicenseService = new LicenseService();

const registerLicense = async (req, res, next) => {
  try {
    const { mac_address, hwid, serial_key, device_name, ip_address } = req.body;
    const meta = extractClientMeta(req);

    const result = await defaultLicenseService.registerLicense({
      mac_address,
      hwid,
      serial_key,
      device_name,
      ip_address,
      meta,
    });

    return res.status(200).json({
      status: true,
      message: result.message,
      iniContent: result.iniContent,
      expiresAt: result.expiresAt,
      isReactivation: result.isReactivation,
    });
  } catch (error) {
    next(error);
  }
};

const validateLicense = async (req, res, next) => {
  try {
    const { serial_key, mac_address, hwid } = req.body;
    const meta = extractClientMeta(req);

    const result = await defaultLicenseService.validateLicense({
      serial_key,
      mac_address,
      hwid,
      meta,
    });

    return res.status(200).json({
      status: true,
      valid: result.valid,
      message: "License is active and valid",
      licenseType: result.licenseType,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    next(error);
  }
};

const revokeLicense = async (req, res, next) => {
  try {
    const { serial_key, license_id, reason } = req.body;
    const userId = req.user?.user_id || req.user?.userId || null;
    const meta = extractClientMeta(req);

    const result = await defaultLicenseService.revokeLicense({
      serial_key,
      license_id,
      reason,
      userId,
      meta,
    });

    return res.status(200).json({
      status: true,
      message: `License ${result.serialKey} has been revoked successfully`,
    });
  } catch (error) {
    next(error);
  }
};

const deactivateDevice = async (req, res, next) => {
  try {
    const { activation_id, reason } = req.body;
    const userId = req.user?.user_id || req.user?.userId || null;
    const meta = extractClientMeta(req);

    const result = await defaultLicenseService.deactivateDevice({
      activation_id,
      reason,
      userId,
      meta,
    });

    return res.status(200).json({
      status: true,
      message: `Device ${result.macAddress} has been deactivated. License slot released.`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerLicense,
  validateLicense,
  revokeLicense,
  deactivateDevice,
};