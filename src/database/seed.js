const { prisma } = require("./prisma");
const bcrypt = require("bcryptjs");

async function seedDatabase() {
  try {
    console.log("Starting database seeding...");

    const defaultUsers = [
      {
        username: "admin",
        email: "vvksngh100@gmail.com",
        password: "k8dfh8c@Pfv0gB2!xZ",
        fullName: "System Administrator",
        role: "admin",
      },
    ];

    for (const userData of defaultUsers) {
      const existingUser = await prisma.skUser.findFirst({
        where: {
          OR: [
            { username: userData.username },
            { email: userData.email },
          ],
        },
      });

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        await prisma.skUser.create({
          data: {
            username: userData.username,
            email: userData.email,
            password: hashedPassword,
            fullName: userData.fullName,
            role: userData.role,
            isActive: true,
          },
        });

        console.log(`User ${userData.username} created successfully`);
        console.log(`You can login with:
          Username: ${userData.username}
          Email: ${userData.email}
          Password: ${userData.password}
        `);
      } else {
        console.log(`User ${userData.username} already exists`);
      }
    }

    console.log("Database seeding completed successfully");
  } catch (error) {
    console.error("Database seeding error:", error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
      console.log("Seeding process finished");
      process.exit(0);
    })
    .catch(async (error) => {
      await prisma.$disconnect();
      console.error("Seeding process failed:", error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };