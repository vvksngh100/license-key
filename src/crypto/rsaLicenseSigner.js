const crypto = require("crypto");
require("dotenv").config();

/**
 * Base License Signer Interface / Contract (OCP & LSP)
 * Any signer implementation must provide a sign(payload) method.
 */
class BaseLicenseSigner {
  sign(payload) {
    throw new Error("Method 'sign(payload)' must be implemented by subclass.");
  }
}

/**
 * RSA-SHA256 Implementation of License Signer
 * Signs payload and formats into INI format with Base64 signature.
 */
class RsaLicenseSigner extends BaseLicenseSigner {
  constructor(privateKeyBase64 = process.env.PRIVATE_KEY) {
    super();
    this.privateKeyBase64 = privateKeyBase64;
  }

  getPrivateKey() {
    if (!this.privateKeyBase64) {
      throw new Error("PRIVATE_KEY configuration is missing on server");
    }

    const privateKey = Buffer.from(this.privateKeyBase64, "base64").toString("utf-8");
    if (
      !privateKey.includes("-----BEGIN PRIVATE KEY-----") &&
      !privateKey.includes("-----BEGIN RSA PRIVATE KEY-----")
    ) {
      throw new Error("Invalid private key format");
    }
    return privateKey;
  }

  /**
   * Signs the license payload and formats as an INI file
   * @param {Object} payload 
   * @returns {string} INI formatted license string
   */
  sign(payload) {
    const privateKey = this.getPrivateKey();
    const licenseJson = JSON.stringify(payload);

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(licenseJson);
    signer.end();
    const signature = signer.sign(privateKey, "base64");

    return `[License]\ndata=${Buffer.from(licenseJson).toString("base64")}\nsignature=${signature}\n`;
  }
}

module.exports = {
  BaseLicenseSigner,
  RsaLicenseSigner,
};
