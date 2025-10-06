const { pool } = require("./db");

async function initializeDatabase() {
  let connection;
  try {
    // create lincense table
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS licenses (
          license_id CHAR(36) PRIMARY KEY DEFAULT (uuid()),
          serial_key VARCHAR(100) UNIQUE NOT NULL,
          customer_id CHAR(36) NOT NULL,
          product_version VARCHAR(20) NOT NULL,
          license_type ENUM('trial', 'enterprise') NOT NULL,
          activation_date TIMESTAMP,
          max_devices INT DEFAULT 1,
          status ENUM('active', 'inactive', 'revoked') DEFAULT 'inactive',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by CHAR(36),
          updated_by CHAR(36)
            )
        `);

    // create customer table
    await pool.execute(`
            CREATE TABLE IF NOT EXISTS customers (
              customer_id CHAR(36) PRIMARY KEY DEFAULT (uuid()),
              email VARCHAR(255) UNIQUE NOT NULL,
              company_name VARCHAR(255),
              contact_person VARCHAR(100),
              phone VARCHAR(20),
              address TEXT,
              country VARCHAR(50),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_by CHAR(36),
              updated_by CHAR(36)
                )
            `);

    // create activations table
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS activations (
          activation_id CHAR(36) PRIMARY KEY DEFAULT (uuid()),
          license_id CHAR(36) NOT NULL,
          mac_address VARCHAR(255) NOT NULL, 
          device_name VARCHAR(100),
          ip_address VARCHAR(45),
          activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_validation TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          encrypted_key TEXT,
          FOREIGN KEY (license_id) REFERENCES licenses(license_id)
              )
        `);

    // create users table
    await pool.execute(`
          CREATE TABLE IF NOT EXISTS users (
            user_id CHAR(36) PRIMARY KEY DEFAULT (uuid()),
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            full_name VARCHAR(100) NOT NULL,
            role ENUM('admin', 'sales', 'engineer') NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )`);

    // create license_audit_log
    await pool.execute(`
          CREATE TABLE IF NOT EXISTS license_audit_log (
            log_id CHAR(36) PRIMARY KEY DEFAULT (uuid()),
            user_id CHAR(36) NOT NULL,
            license_id CHAR(36) NOT NULL,
            action_type VARCHAR(20) NOT NULL,
            action_details JSON,
            ip_address VARCHAR(45),
            user_agent TEXT,  
            browser_name VARCHAR(50), 
            browser_version VARCHAR(20),
            operating_system VARCHAR(50),
            device_type VARCHAR(20), 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

module.exports = { initializeDatabase };
