const { LicenseService } = require("../services/licenseService");
const { extractClientMeta } = require("../utils/clientMeta");

const defaultLicenseService = new LicenseService();

const generateSerialKey = async (req, res, next) => {
  try {
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

    const userId = req.user?.user_id || req.user?.userId || null;
    const meta = extractClientMeta(req);

    const result = await defaultLicenseService.generateSerialKey({
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
      meta,
    });

    return res.status(200).json({
      status: true,
      message: "Serial key generated successfully",
      serialKey: result.serialKey,
      licenseId: result.licenseId,
      expiresAt: result.expiresAt,
      maxDevices: result.maxDevices,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { generateSerialKey };
