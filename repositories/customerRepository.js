const { prisma: defaultPrisma } = require("../database/prisma");

class CustomerRepository {
  constructor(prismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  async findByEmail(email, tx = this.prisma) {
    return tx.customer.findFirst({
      where: { email },
    });
  }

  async findById(customerId, tx = this.prisma) {
    return tx.customer.findUnique({
      where: { customerId },
    });
  }

  async create(data, tx = this.prisma) {
    return tx.customer.create({
      data,
    });
  }

  async update(customerId, data, tx = this.prisma) {
    return tx.customer.update({
      where: { customerId },
      data,
    });
  }

  async findMany({ skip, take } = {}) {
    const queryOptions = {
      orderBy: {
        createdAt: "desc",
      },
    };

    if (skip !== undefined && take !== undefined) {
      queryOptions.skip = skip;
      queryOptions.take = take;
    }

    return this.prisma.customer.findMany(queryOptions);
  }

  async count() {
    return this.prisma.customer.count();
  }
}

module.exports = { CustomerRepository };
