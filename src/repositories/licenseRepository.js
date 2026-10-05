const { prisma: defaultPrisma } = require("../database/prisma");

class LicenseRepository {
  constructor(prismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  async findBySerialKey(serialKey, { includeActivations = false } = {}) {
    return this.prisma.license.findUnique({
      where: { serialKey },
      include: {
        activations: includeActivations,
      },
    });
  }

  async findById(licenseId, { includeActivations = false } = {}) {
    return this.prisma.license.findUnique({
      where: { licenseId },
      include: {
        activations: includeActivations,
      },
    });
  }

  async create(data, tx = this.prisma) {
    return tx.license.create({
      data,
    });
  }

  async update(licenseId, data, tx = this.prisma) {
    return tx.license.update({
      where: { licenseId },
      data,
    });
  }

  async createActivation(data, tx = this.prisma) {
    return tx.activation.create({
      data,
    });
  }

  async updateActivation(activationId, data, tx = this.prisma) {
    return tx.activation.update({
      where: { activationId },
      data,
    });
  }

  async findActivationById(activationId) {
    return this.prisma.activation.findUnique({
      where: { activationId },
    });
  }

  async deactivateAllForLicense(licenseId, tx = this.prisma) {
    return tx.activation.updateMany({
      where: { licenseId },
      data: { isActive: false },
    });
  }

  async createAuditLog(data, tx = this.prisma) {
    return tx.licenseAuditLog.create({
      data,
    });
  }

  /**
   * Executes an atomic database transaction with resilient cloud timeouts and backoff retry.
   * @param {Function} transactionCallback 
   * @param {Object} options 
   */
  async runTransaction(transactionCallback, { maxTries = 5, maxWait = 15000, timeout = 30000 } = {}) {
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        return await this.prisma.$transaction(transactionCallback, {
          maxWait,
          timeout,
        });
      } catch (error) {
        if ((error.code === "P2002" || error.code === "P2028") && attempt < maxTries) {
          const delay = attempt * 1000;
          console.warn(`Transaction attempt ${attempt} encountered ${error.code}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  }
}

module.exports = { LicenseRepository };
