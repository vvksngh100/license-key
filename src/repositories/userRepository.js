const { prisma: defaultPrisma } = require("../database/prisma");

class UserRepository {
  constructor(prismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  async findByUsernameOrEmail(identifier) {
    return this.prisma.skUser.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });
  }

  async findById(userId) {
    return this.prisma.skUser.findUnique({
      where: { userId },
    });
  }

  async findMany({ skip, take } = {}) {
    const queryOptions = {
      select: {
        userId: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
        recver: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    };

    if (skip !== undefined && take !== undefined) {
      queryOptions.skip = skip;
      queryOptions.take = take;
    }

    return this.prisma.skUser.findMany(queryOptions);
  }

  async count() {
    return this.prisma.skUser.count();
  }

  async create(data) {
    return this.prisma.skUser.create({
      data,
    });
  }

  async updateLastLogin(userId) {
    return this.prisma.skUser.update({
      where: { userId },
      data: { lastLogin: new Date() },
    });
  }
}

module.exports = { UserRepository };
