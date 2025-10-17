const { pool } = require("./db");
const bcrypt = require("bcryptjs");

async function seedDatabase() {
  try {
    console.log("Starting database seeding...");

    // Default admin user
    const defaultUsers = [
      {
        username: "admin",
        email: "elexorn.research@outlook.com",
        password: "admin123",
        full_name: "System Administrator",
        role: "admin"
      }
    ];

    for (const userData of defaultUsers) {
      // Check if user already exists
      const [existingUsers] = await pool.execute(
        "SELECT user_id FROM sk_users WHERE username = ? OR email = ?",
        [userData.username, userData.email]
      );

      if (existingUsers.length === 0) {
        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        // Insert user
        await pool.execute(
          `INSERT INTO sk_users (username, email, password, full_name, role, is_active) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userData.username, userData.email, hashedPassword, userData.full_name, userData.role, true]
        );
        
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

// Run if this file is executed directly
if (require.main === module) {
  seedDatabase().then(() => {
    console.log("Seeding process finished");
    process.exit(0);
  }).catch(error => {
    console.error("Seeding process failed:", error);
    process.exit(1);
  });
}

module.exports = { seedDatabase };