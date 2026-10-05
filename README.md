# 🛡️ Energy Monitoring System — Licensing & Device Activation Service

A production-ready, cryptographically secure licensing and device activation backend built with **Node.js**, **Express**, **PostgreSQL**, and **Prisma ORM**.

This service issues product serial keys, manages customer entitlements, enforces multi-device limits, and cryptographically signs license payloads using **RSA-SHA256**. Client applications (industrial PCs, desktop software, or IoT edge gateways) can verify licenses offline with a bundled public key and check in periodically via an online validation heartbeat.

---

## 📋 Table of Contents

- [Key Features](#-key-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Database Schema (Prisma)](#-database-schema-prisma)
- [Cryptographic Verification Workflow](#-cryptographic-verification-workflow)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup & Seeding](#database-setup--seeding)
  - [Running the Server](#running-the-server)
- [API Reference](#-api-reference)
  - [Authentication](#authentication)
  - [Staff & Customer Management](#staff--customer-management)
  - [Serial Key Issuance](#serial-key-issuance)
  - [Device Hardware Activation & Heartbeat](#device-hardware-activation--heartbeat)
  - [License Administration & Revocation](#license-administration--revocation)
- [Client Integration Guide (.exe / Desktop)](#-client-integration-guide-exe--desktop)
  - [1. Generating Hardware ID (HWID)](#1-generating-hardware-id-hwid-windows)
  - [2. Validating the Signed .ini File Offline](#2-validating-the-signed-ini-file-offline)
- [NPM Scripts](#-npm-scripts)
- [Project Structure](#-project-structure)

---

## 🚀 Key Features

- **🔐 Asymmetric RSA-SHA256 Signing**: Licenses are signed on the server with a private key. The client application verifies licenses offline with a bundled public key without exposing private credentials.
- **💻 Hardware Binding (Anti-Piracy & Anti-Cloning)**: Binds licenses to both **MAC Address** and a multi-factor **Hardware ID (HWID)** derived from CPU, Motherboard, and Disk serials. Prevents copying `.ini` license files between machines or spoofing network adapters.
- **🔄 Multi-Device Seat Management**: Supports licenses with configurable `max_devices` (e.g. 1 seat for Trial, 5 or more seats for Enterprise).
- **🩹 Re-Activation & Recovery**: If an already-activated machine reinstall its OS or loses its license file, re-registering the same key restores the existing signed `.ini` without burning an extra device seat.
- **⏳ Expiration & Trial Support**: Supports fixed trial periods (e.g. 30 days) and custom subscription durations. Expiry timestamps are signed inside the license file for offline enforcement.
- **👥 Customer Deduplication**: Automatically finds or updates existing customer profiles by email rather than creating redundant database rows.
- **🛡️ Role-Based Access Control (RBAC)**: Enforces permission boundaries across `admin`, `sales`, and `engineer` roles.
- **🚦 Brute-Force Rate Limiting**: Protects login and activation endpoints with `express-rate-limit` against brute-force password guessing and automated key scanning.
- **📊 Comprehensive Audit Logging**: Tracks every key generation, activation, re-activation, and revocation with client IP, user agent, browser, and OS metadata.
- **🔁 Optimistic Concurrency Versioning (`recver`)**: Automatic `recver` version counter on every table for safe concurrent data handling.

---

## 🛠️ Architecture & Tech Stack

| Component | Technology |
| :--- | :--- |
| **Runtime** | Node.js (CommonJS) |
| **Framework** | Express.js 5 |
| **Database** | PostgreSQL |
| **ORM** | Prisma ORM 5 |
| **Authentication** | JWT (`jsonwebtoken`) & `bcryptjs` password hashing |
| **Cryptography** | Node.js native `crypto` (RSA-SHA256, 2048-bit keys) |
| **Security** | `express-rate-limit`, `cors` |
| **Device Intelligence** | `ua-parser-js` |

---

## 🗄️ Database Schema (Prisma)

The database schema is defined in [`prisma/schema.prisma`](./prisma/schema.prisma):

```mermaid
erDiagram
    SK_USERS ||--o{ LICENSE_AUDIT_LOG : "audited by"
    CUSTOMERS ||--o{ LICENSES : "owns"
    LICENSES ||--o{ ACTIVATIONS : "activates on"
    LICENSES ||--o{ LICENSE_AUDIT_LOG : "logs"

    SK_USERS {
        string user_id PK
        string username UK
        string email UK
        string password
        string full_name
        enum role "admin | sales | engineer"
        boolean is_active
        datetime last_login
        int recver
    }

    CUSTOMERS {
        string customer_id PK
        string email
        string company_name
        string contact_person
        string phone
        string address
        string country
        int recver
    }

    LICENSES {
        string license_id PK
        string serial_key UK
        string customer_id FK
        string product_version
        enum license_type "trial | enterprise"
        datetime activation_date
        int validity_days
        datetime expires_at
        int max_devices
        enum status "active | inactive | revoked"
        int recver
    }

    ACTIVATIONS {
        string activation_id PK
        string license_id FK
        string mac_address
        string hwid
        string device_name
        string ip_address
        datetime activated_at
        datetime last_validation
        boolean is_active
        text encrypted_key
        int recver
    }

    LICENSE_AUDIT_LOG {
        string log_id PK
        string user_id FK
        string license_id FK
        string action_type "CREATE | ACTIVATION | REACTIVATION | REVOKE | DEACTIVATE_DEVICE"
        json action_details
        string ip_address
        string user_agent
        int recver
    }
```

---

## 🔐 Cryptographic Verification Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Staff / Sales
    actor Client as Client Device (.exe)
    participant Server as Licensing API
    participant DB as PostgreSQL (Prisma)

    Note over Admin,Server: 1. Key Generation
    Admin->>Server: POST /api/auth/serial-key (customer info, validity_days, max_devices)
    Server->>DB: Upsert Customer & Create License (status: inactive)
    Server-->>Admin: Returns 16-char Serial Key (XXXX-XXXX-XXXX-XXXX)

    Note over Client,Server: 2. Hardware Registration
    Client->>Server: POST /api/auth/register-license (serial_key, mac_address, hwid, device_name)
    Server->>DB: Validate key & check active devices < max_devices
    Server->>Server: Sign {serial_key, mac_address, hwid, expires_at} using RSA private.pem
    Server->>DB: Insert Activation & Update License (status: active)
    Server-->>Client: Returns signed .ini content

    Note over Client: 3. Daily Offline Run
    Client->>Client: Verify .ini signature using bundled public.pem
    Client->>Client: Verify local physical HWID matches signed HWID

    Note over Client,Server: 4. Periodic Online Heartbeat
    Client->>Server: POST /api/auth/validate-license (serial_key, mac_address, hwid)
    Server->>DB: Update last_validation & verify not revoked/expired
    Server-->>Client: Returns { valid: true }
```

---

## 📦 Getting Started

### Prerequisites

- **Node.js** (v18.0.0 or higher recommended)
- **PostgreSQL** (v13 or higher running locally or in cloud e.g. Supabase, AWS RDS, Neon)
- **OpenSSL** (optional, for regenerating RSA key pairs)

---

### Installation

1. Clone or open the project directory:
   ```bash
   cd "Serial Key"
   ```

2. Install all dependencies:
   ```bash
   npm install
   ```

---

### Environment Configuration

Create or update the `.env` file in the root directory:

```env
# Server Port
PORT=3002

# PostgreSQL Connection String for Prisma
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/serial_key?schema=public"

# JWT Secret & Expiration
JWT_SECRET="your-super-strong-jwt-secret-at-least-32-chars"
JWT_EXPIRES_IN="7d"

# RSA 2048-bit Private Key (Base64-encoded)
PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t..."

# RSA 2048-bit Public Key (Base64-encoded, for client verification)
PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0..."
```

> **Tip:** You can generate a fresh Base64 RSA key pair in PowerShell:
> ```powershell
> # Encode private.pem to base64
> [Convert]::ToBase64String([IO.File]::ReadAllBytes("keys/private.pem"))
> ```

---

### Database Setup & Seeding

1. **Push the Prisma schema to your PostgreSQL database**:
   ```bash
   npm run prisma:push
   ```

2. **Generate the Prisma Client**:
   ```bash
   npm run prisma:generate
   ```

3. **Seed the initial Administrator account**:
   ```bash
   npm run prisma:seed
   ```
   *Default Admin login:*
   - **Username**: `admin`
   - **Email**: `vvksngh100@gmail.com`
   - **Password**: configured in `database/seed.js`

---

### Running the Server

```bash
# Start in development mode (with nodemon auto-restart)
npm run dev

# Start in production mode
npm start
```

The server will start on `http://localhost:3002` (or the port defined in `.env`).

---

## 📡 API Reference

Base URL: `http://localhost:3002/api`

### Authentication

#### 1. Staff Login
- **Endpoint:** `POST /api/auth/login`
- **Rate Limit:** 10 requests / 15 minutes
- **Request Body:**
  ```json
  {
    "username": "admin",
    "password": "your-password"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": true,
    "message": "Logged in successfully.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5...",
    "user": {
      "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
  ```

#### 2. Get Authenticated User Profile
- **Endpoint:** `GET /api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Current decoded user object.

---

### Staff & Customer Management

#### 3. Create Staff User (Admin Only)
- **Endpoint:** `POST /api/auth/create-user`
- **Headers:** `Authorization: Bearer <token>` (Role: `admin`)
- **Request Body:**
  ```json
  {
    "username": "john_sales",
    "email": "john@company.com",
    "password": "StrongPassword123!",
    "full_name": "John Doe",
    "role": "sales"
  }
  ```

#### 4. List All Staff Users (Admin Only)
- **Endpoint:** `GET /api/auth/users`
- **Headers:** `Authorization: Bearer <token>` (Role: `admin`)

#### 5. List All Customers
- **Endpoint:** `GET /api/auth/customers`
- **Headers:** `Authorization: Bearer <token>` (Role: `admin`, `sales`, or `engineer`)

---

### Serial Key Issuance

#### 6. Generate Serial Key
- **Endpoint:** `POST /api/auth/serial-key`
- **Headers:** `Authorization: Bearer <token>` (Role: `admin` or `sales`)
- **Request Body:**
  ```json
  {
    "email": "purchasing@clientcorp.com",
    "company_name": "Client Corp Ltd",
    "contact_person": "Jane Smith",
    "phone": "+1 555-0199",
    "address": "123 Industrial Way",
    "country": "USA",
    "product_version": "2.4.0",
    "license_type": "enterprise",
    "validity_days": 365,
    "max_devices": 5
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": true,
    "message": "Serial key generated successfully",
    "serialKey": "G4H8-9KL2-MN45-PQ78",
    "licenseId": "8f6c3a1b-...",
    "expiresAt": "2027-10-05T10:00:00.000Z",
    "maxDevices": 5,
    "attempt": 1
  }
  ```

---

### Device Hardware Activation & Heartbeat

#### 7. Client Hardware Registration & Activation
- **Endpoint:** `POST /api/auth/register-license`
- **Auth:** Public (Rate-limited: 30 requests / minute)
- **Request Body:**
  ```json
  {
    "serial_key": "G4H8-9KL2-MN45-PQ78",
    "mac_address": "00:1A:2B:3C:4D:5E",
    "hwid": "a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9",
    "device_name": "Plant-1-Gateway-PC"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": true,
    "message": "Device registered and license activated successfully",
    "iniContent": "[License]\ndata=eyJzZXJpYWxfa2V5IjoiRzRIO...==\nsignature=MEQCIG...\n",
    "expiresAt": "2027-10-05T10:00:00.000Z",
    "attempt": 1
  }
  ```
  *(If the same device re-activates, returns `isReactivation: true` with the existing `.ini` license without burning an extra seat).*

#### 8. Periodic Heartbeat / Validation
- **Endpoint:** `POST /api/auth/validate-license`
- **Auth:** Public (Rate-limited: 30 requests / minute)
- **Request Body:**
  ```json
  {
    "serial_key": "G4H8-9KL2-MN45-PQ78",
    "mac_address": "00:1A:2B:3C:4D:5E",
    "hwid": "a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": true,
    "valid": true,
    "message": "License is active and valid",
    "licenseType": "enterprise",
    "expiresAt": "2027-10-05T10:00:00.000Z"
  }
  ```

---

### License Administration & Revocation

#### 9. Revoke License (Admin Only)
- **Endpoint:** `POST /api/auth/revoke-license`
- **Headers:** `Authorization: Bearer <token>` (Role: `admin`)
- **Request Body:**
  ```json
  {
    "serial_key": "G4H8-9KL2-MN45-PQ78",
    "reason": "Payment dispute / contract terminated"
  }
  ```
- **Response (200 OK):** All linked device activations are deactivated instantly.

#### 10. Deactivate Single Device Seat (Admin Only)
- **Endpoint:** `POST /api/auth/deactivate-device`
- **Headers:** `Authorization: Bearer <token>` (Role: `admin`)
- **Request Body:**
  ```json
  {
    "activation_id": "c1a2b3c4-...",
    "reason": "Old hardware decommissioned"
  }
  ```
- **Response (200 OK):** Frees up 1 seat for the customer on their multi-device license.

---

## 💻 Client Integration Guide (.exe / Desktop)

### 1. Generating Hardware ID (HWID) on Windows
In your client application or edge agent, compute the machine's hardware fingerprint:

```javascript
const { execSync } = require("child_process");
const crypto = require("crypto");

function getHardwareFingerprint() {
  try {
    const cpu = execSync("wmic cpu get ProcessorId").toString().replace("ProcessorId", "").trim();
    const bios = execSync("wmic csproduct get uuid").toString().replace("UUID", "").trim();
    const disk = execSync("wmic diskdrive get serialnumber").toString().split("\n")[1].trim();

    return crypto.createHash("sha256").update(`${cpu}-${bios}-${disk}`).digest("hex");
  } catch (err) {
    // Fallback for virtualized or restricted environments
    return null;
  }
}
```

### 2. Validating the Signed .ini File Offline
The client app saves the returned `.ini` to disk (e.g. `license.ini`). On every startup:

```javascript
const fs = require("fs");
const crypto = require("crypto");

function verifyLocalLicense(iniFilePath, publicKeyPem, currentDeviceMac, currentHwid) {
  const content = fs.readFileSync(iniFilePath, "utf8");

  const dataMatch = content.match(/data=(.+)/);
  const sigMatch = content.match(/signature=(.+)/);

  if (!dataMatch || !sigMatch) {
    throw new Error("Invalid license file structure.");
  }

  const base64Data = dataMatch[1].trim();
  const signature = sigMatch[1].trim();
  const jsonString = Buffer.from(base64Data, "base64").toString("utf8");
  const payload = JSON.parse(jsonString);

  // 1. Verify RSA-SHA256 signature with bundled public key
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(jsonString);
  const isValidSig = verifier.verify(publicKeyPem, signature, "base64");

  if (!isValidSig) {
    throw new Error("License file has been tampered with or corrupted!");
  }

  // 2. Verify Hardware Binding (Anti-copy check)
  if (payload.mac_address.toUpperCase() !== currentDeviceMac.toUpperCase()) {
    throw new Error("License belongs to another computer (MAC mismatch)!");
  }
  if (payload.hwid && currentHwid && payload.hwid !== currentHwid) {
    throw new Error("License belongs to another computer (Hardware mismatch)!");
  }

  // 3. Verify Expiration
  if (payload.expires_at && new Date(payload.expires_at) < new Date()) {
    throw new Error("Your software license has expired!");
  }

  return payload; // License is valid!
}
```

---

## ⚡ NPM Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm start` | `node index.js` | Runs production server |
| `npm run dev` | `nodemon index.js` | Runs development server with hot-reload |
| `npm run prisma:generate` | `prisma generate` | Generates TypeScript/JavaScript Prisma Client |
| `npm run prisma:push` | `prisma db push` | Pushes schema changes directly to PostgreSQL |
| `npm run prisma:migrate` | `prisma migrate dev`| Creates and runs SQL migrations |
| `npm run prisma:studio` | `prisma studio` | Opens web-based GUI to browse PostgreSQL data |
| `npm run prisma:seed` | `node database/seed.js`| Seeds initial admin user into PostgreSQL |

---

## 📂 Project Structure

```
Serial Key/
├── controllers/
│   ├── authController.js        # Internal staff login, user creation, and profile
│   ├── customerController.js    # Customer listing and details
│   ├── licenseController.js     # Hardware registration, RSA signing, heartbeat, revoke
│   └── serialKeyController.js   # Serial key generator with customer deduplication
├── database/
│   ├── db.js                    # Database re-export helper
│   ├── init.js                  # Database connection tester and seeder
│   ├── prisma.js                # Prisma Client instance with auto-recver extension
│   └── seed.js                  # Administrator seeding script
├── keys/
│   ├── private.pem              # RSA private key (keep confidential, ignored by git)
│   └── public.pem               # RSA public key (shipped with client application)
├── middleware/
│   ├── auth.js                  # JWT validation & Role-Based Access Control (requireRole)
│   └── rateLimiter.js           # Express rate limiters for login & activation
├── prisma/
│   └── schema.prisma            # PostgreSQL schema, models, enums, and indexes
├── routes/
│   └── routes.js                # Express routing definitions
├── .env                         # Environment variables (port, db url, rsa keys)
├── .gitignore                   # Git ignore rules (.env, keys/*.pem, node_modules)
├── index.js                     # Express app entry point
├── package.json                 # Project dependencies and npm scripts
└── README.md                    # Project documentation
```

---

## 📄 License
Proprietary software for **Energy Monitoring System**. All rights reserved.
