# Industrial Licensing & Device Activation Engine (Production-Grade Node.js + Prisma)

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v20+-43853D?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-v5.0+-000000?style=for-the-badge&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v15+-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org)
[![Prisma ORM](https://img.shields.io/badge/Prisma-v5.22+-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io)
[![RSA Cryptography](https://img.shields.io/badge/RSA--SHA256-2048--bit-E05D44?style=for-the-badge&logo=letsencrypt)](https://nodejs.org/api/crypto.html)
[![JWT](https://img.shields.io/badge/JWT-Protected-000000?style=for-the-badge&logo=jsonwebtokens)](https://jwt.io)
[![OpenAPI/Swagger](https://img.shields.io/badge/Swagger-OpenAPI%203.0-85EA2D?style=for-the-badge&logo=swagger)](https://swagger.io)

**Cryptographically Bound Hardware Licensing Engine with Asymmetric RSA Signatures & Multi-Device Concurrency Control**  
_Engineered for zero-leak offline enforcement, hardware anti-cloning (HWID + MAC), self-healing re-activations, and crash-proof execution on resource-constrained environments_

<br />

[![API Docs](https://img.shields.io/badge/Swagger-Interactive%20API%20Docs-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)](#-interactive-api-documentation-swagger--openapi-30)
[![Database Schema](https://img.shields.io/badge/Prisma-PostgreSQL%20Schema-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](#-database-schema--erd)

</div>

---

## Executive Summary

The **Industrial Licensing & Device Activation Engine** is an enterprise-grade backend service built for the **Energy Monitoring System** ecosystem. It governs software entitlements, manages commercial subscriptions, and cryptographically signs client machine activations for industrial gateways, edge PCs, and desktop dashboards.

Unlike naive licensing solutions that rely on insecure plain-text checks or brittle third-party licensing SaaS APIs, this system is engineered to solve **fundamental security, hardware-binding, and distributed concurrency challenges**:
- **Zero Cloud Licensing Lock-in (Air-Gapped Offline Support):** Uses asymmetric **RSA-SHA256** digital signatures. The private signing key resides strictly on the backend, allowing client binaries (`.exe`) to verify signed `.ini` license files offline with zero external network connectivity.
- **Hardware Anti-Cloning & Anti-Spoofing:** Binds software entitlements to a composite **Hardware Fingerprint (HWID)** derived from CPU, Motherboard, and Disk serial numbers alongside physical network MAC addresses, defeating VM cloning and network adapter spoofing.
- **Dynamic Seat Concurrency & Self-Healing Recovery:** Enforces multi-device caps (`max_devices`) while automatically detecting re-installs on authorized hardware to restore existing licenses without burning extra client seats or requiring manual support intervention.
- **Optimistic Concurrency Control (`recver`):** Features an automated record-versioning engine across all relational models to prevent lost updates during concurrent license provisioning and updates.

---

## High-Level System Topology

```
+----------------------------------------------------------------------------------------+
|                      CLIENT RUNTIME TIER (.exe / Edge Gateway)                         |
|  - Multi-Factor Hardware Fingerprint Generator: SHA-256(CPU + BIOS + Disk)             |
|  - Cryptographic Offline Verifier: Verifies RSA-SHA256 Signature via public.pem        |
|  - Periodic Online Heartbeat / Validation Agent (POST /api/auth/validate-license)       |
+-------------------------------------------+--------------------------------------------+
                                            | HTTPS / Signed Payload Transfer
                                            v
+----------------------------------------------------------------------------------------+
|                          EXPRESS 5 API SERVER (Application Tier)                       |
|  - Role-Based Access Control (RBAC): Admin | Sales | Engineer                          |
|  - Distributed Rate Limiter: Login Guard (10 req/15m), Activation Guard (30 req/m)     |
|  - Customer Deduplication & Atomic Entitlement Provisioning Engine                     |
|  - Interactive OpenAPI / Swagger UI at /api-docs                                       |
+---------------------+--------------------------------------------+---------------------+
                      | RSA Private Key Signing                    | Prisma Query Engine
                      v                                            v
       +------------------------------+             +------------------------------------+
       |   CRYPTOGRAPHIC CORE         |             |   PRISMA ORM / CLIENT EXTENSION    |
       |   (Node Native crypto)       |             |   (database/prisma.js)             |
       |  - RSA-SHA256 2048-bit       |             |  - Automated OCC recver increment  |
       |  - Base64 .ini payload pack  |             |  - Query logging & connection pool |
       |  - Strict key validation     |             |  - Zero-cost relation joins        |
       +------------------------------+             +-----------------+------------------+
                                                                      |
                                                                      v
                                                    +------------------------------------+
                                                    |      POSTGRESQL RELATIONAL STORE   |
                                                    |  - sk_users (Staff credentials)    |
                                                    |  - customers (Deduplicated CRM)    |
                                                    |  - licenses (Serial keys & caps)   |
                                                    |  - activations (Hardware bindings) |
                                                    |  - license_audit_log (Audit trail) |
                                                    +------------------------------------+
```

---

## Architectural Deep Dives

### 1. Asymmetric Cryptographic Signing (RSA-SHA256)

#### The Problem Statement
Symmetric license keys (shared secret keys or AES tokens) require the client binary to store the decryption secret. Malicious users can decompile or reverse-engineer the client `.exe`, extract the symmetric key, and generate an unlimited number of valid serial keys.

#### Our Solution: Asymmetric RSA-SHA256 Signature Isolation
The server acts as a **Certificate Authority**:
1. The server retains the **2048-bit Private Key (`private.pem`)**.
2. The client `.exe` contains only the public verification key (`public.pem`).
3. During activation, the server signs a canonical JSON payload:
   ```json
   {
     "serial_key": "K8F4-MN92-XP77-L4Q2",
     "mac_address": "00:1A:2B:3C:4D:5E",
     "hwid": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
     "license_type": "enterprise",
     "issued_at": "2026-10-05T10:00:00.000Z",
     "expires_at": "2027-10-05T10:00:00.000Z"
   }
   ```
4. Output is serialized into an industrial standard `.ini` file:
   ```ini
   [License]
   data=eyJzZXJpYWxfa2V5IjoiSzhGNC1NTjkyLV...
   signature=MEQCIG5...
   ```
5. **Tamper Proof:** Modifying even a single character in the `data` payload breaks the RSA digital signature, preventing users from altering expiration dates, MAC addresses, or license tiers.

---

### 2. Multi-Factor Hardware Fingerprinting (Anti-Cloning & Anti-Spoofing)

#### The Problem Statement
Relying solely on a MAC address allows users to:
- Change or clone the network adapter MAC address in Windows Device Manager.
- Snapshot a Virtual Machine (VM) running an activated client and duplicate it across 50 bare-metal servers.

#### Our Solution: Non-Transferable Multi-Attribute Fingerprint (HWID)
The client gathers immutable motherboard, processor, and storage controller hardware serial numbers directly from system management instrumentation (WMI):
```javascript
// Client HWID Generation
const cpu = execSync("wmic cpu get ProcessorId").toString().replace("ProcessorId", "").trim();
const bios = execSync("wmic csproduct get uuid").toString().replace("UUID", "").trim();
const disk = execSync("wmic diskdrive get serialnumber").toString().split("\n")[1].trim();

const hwid = crypto.createHash("sha256").update(`${cpu}-${bios}-${disk}`).digest("hex");
```
- **Defense-in-Depth:** The server records both `mac_address` and `hwid`. Even if an adversary clones a virtual network card, the underlying CPU and BIOS UUID mismatch halts application startup immediately.

---

### 3. Dynamic Seat Concurrency & Self-Healing Recovery

#### The "Burned Seat" Dilemma
In rigid licensing systems, if a licensed machine's operating system crashes or the hard drive is replaced, re-registering with the same serial key throws:
`"Error: License already activated (Limit: 1/1)"`. The client is locked out and forced to open support tickets.

#### Our Solution: Self-Healing Device Identity Resolution
When `/api/auth/register-license` is called:
```mermaid
flowchart TD
    A["Incoming Activation Request (serial_key, mac_address, hwid)"] --> B{"Is this (MAC || HWID)\nalready registered for this license?"}
    B -- "YES (Known Device)" --> C["Re-activation Recovery Flow:\n- Refresh last_validation timestamp\n- Re-issue current valid .ini\n- Burn 0 extra seats\n- Log REACTIVATION in Audit Trail"]
    B -- "NO (New Device)" --> D{"Count Active Devices < max_devices?"}
    D -- "NO (Seat Cap Reached)" --> E["❌ HTTP 403:\nMax allowed devices reached"]
    D -- "YES (Seats Available)" --> F["✅ Atomic Activation:\n- Register new Activation row\n- Set license status to active\n- Log ACTIVATION in Audit Trail"]
```
This guarantees zero legitimate user lockouts during OS re-installations while strictly honoring `max_devices` quotas.

---

### 4. Automated Optimistic Concurrency Control (`recver`)

Every table in PostgreSQL implements an integer version column (`recver Int @default(0)`).
To avoid repetitive manual increment logic across controllers, our Prisma Client utilizes a **Prisma Query Extension (`$extends`)**:

```javascript
// database/prisma.js
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async update({ args, query }) {
        if (args.data && args.data.recver === undefined) {
          args.data = { ...args.data, recver: { increment: 1 } };
        }
        return query(args);
      },
    },
  },
});
```
Every modification atomically increments `recver`, enabling database-level optimistic concurrency protection against race conditions.

---

## 🗄️ Database Schema & ERD

```
+-------------------+        +--------------------+        +---------------------+
|     sk_users      |        |     customers      |        |      licenses       |
+-------------------+        +--------------------+        +---------------------+
| user_id (UUID) PK |        | customer_id (UUID) |        | license_id (UUID) PK|
| username (Unique) |        | email (Indexed)    |<---+---| customer_id (FK)    |
| email (Unique)    |        | company_name       |    |   | serial_key (Unique) |
| password (bcrypt) |        | contact_person     |    |   | product_version     |
| role (Enum)       |        | phone, country     |    |   | license_type (Enum) |
| is_active         |        | recver (OCC)       |    |   | validity_days       |
| recver (OCC)      |        +--------------------+    |   | expires_at (Indexed)|
+---------+---------+                                  |   | max_devices         |
          |                                            |   | status (Indexed)    |
          |                                            |   | recver (OCC)        |
          |                                            |   +----------+----------+
          |                                            |              |
          |          +----------------------------+    |              |
          |          |     license_audit_log      |    |              v
          |          +----------------------------+    |   +---------------------+
          +--------->| log_id (UUID) PK           |    |   |     activations     |
                     | user_id (FK, Nullable)     |    |   +---------------------+
                     | license_id (FK) <----------+----+---| activation_id PK    |
                     | action_type (CREATE, ...)  |        | license_id (FK)     |
                     | action_details (JSON)      |        | mac_address (Indexed|
                     | ip_address, user_agent     |        | hwid (Indexed)      |
                     | recver (OCC)               |        | is_active (Indexed) |
                     +----------------------------+        | encrypted_key (INI) |
                                                           | recver (OCC)        |
                                                           +---------------------+
```

---

## 📖 Interactive API Documentation (Swagger / OpenAPI 3.0)

The backend features complete OpenAPI 3.0 specification served interactively via `swagger-ui-express`.

- **Live Interactive UI:** `http://localhost:3002/api-docs`
- **Specification File:** [`swagger.json`](./swagger.json)
- **Features:** Direct JWT authentication tester, request schema inspectors, and live mock runner.

### API Endpoints Summary

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public (Rate-limited: 10/15m) | Authenticates staff and issues JWT token |
| `GET` | `/api/auth/me` | Bearer Token | Fetches current user session profile |
| `POST` | `/api/auth/create-user` | **Admin Only** | Creates staff user (`admin`, `sales`, `engineer`) |
| `GET` | `/api/auth/users` | **Admin Only** | Lists all internal staff users |
| `GET` | `/api/auth/customers` | Admin, Sales, Engineer | Fetches list of all registered customers |
| `POST` | `/api/auth/serial-key` | **Admin, Sales** | Issues serial key with deduplication & expiry |
| `POST` | `/api/auth/register-license` | Public (Rate-limited: 30/m) | Hardware registration, RSA signing, & recovery |
| `POST` | `/api/auth/validate-license` | Public (Rate-limited: 30/m) | Periodic heartbeat and online validation |
| `POST` | `/api/auth/revoke-license` | **Admin Only** | Revokes serial key and shuts down all seats |
| `POST` | `/api/auth/deactivate-device` | **Admin Only** | Releases an individual hardware seat |

---

## Tech Stack & Core Libraries

| Layer | Technologies |
| :--- | :--- |
| **API Runtime** | Node.js (CommonJS), Express 5 |
| **Relational Database** | PostgreSQL 15+ |
| **Database ORM** | Prisma ORM 5 with `$extends` query middleware |
| **Cryptography** | Node native `crypto` (RSA-SHA256, 2048-bit key length) |
| **Security & RBAC** | `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, `cors` |
| **Device Analytics** | `ua-parser-js` (User-agent browser, OS, and hardware parser) |
| **API Documentation** | OpenAPI 3.0, Swagger UI Express |

---

## Getting Started

### Prerequisites
- **Node.js** v18.0.0+ (v20+ recommended)
- **PostgreSQL** instance (local or hosted via Supabase, Neon, AWS RDS)

### 1. Repository Setup & Dependencies
```bash
git clone https://github.com/vvksngh100/license-key.git
cd "Serial Key"
npm install
```

### 2. Environment Configuration
Create or configure `.env` in the root directory:
```env
PORT=3002
NODE_ENV=development

# PostgreSQL Connection URL
DATABASE_URL="postgresql://postgres:password@localhost:5432/serial_key?schema=public"

# JWT Secret & Expiry
JWT_SECRET="your-strong-production-jwt-secret-at-least-32-chars"
JWT_EXPIRES_IN="7d"

# Base64-Encoded RSA 2048-Bit Keys
PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t..."
PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0..."
```

### 3. Database Initialization & Seeding
```bash
# Push schema to PostgreSQL (creates tables & indexes)
npm run prisma:push

# Generate Prisma Client
npm run prisma:generate

# Seed the default admin user
npm run prisma:seed
```

### 4. Running the Application
```bash
# Development with hot-reload
npm run dev

# Production
npm start
```
- API Server: `http://localhost:3002`
- Swagger UI: `http://localhost:3002/api-docs`

---

## Client Integration (.exe / Edge Agent)

Client applications can verify licenses with **zero network connectivity** using the bundled `public.pem`:

```javascript
const fs = require("fs");
const crypto = require("crypto");

function verifyClientLicense(iniPath, publicKeyPem, physicalMac, physicalHwid) {
  const iniContent = fs.readFileSync(iniPath, "utf8");
  const dataMatch = iniContent.match(/data=(.+)/);
  const sigMatch = iniContent.match(/signature=(.+)/);

  if (!dataMatch || !sigMatch) throw new Error("Corrupted license file.");

  const payloadJson = Buffer.from(dataMatch[1].trim(), "base64").toString("utf8");
  const payload = JSON.parse(payloadJson);

  // 1. Asymmetric Signature Check
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payloadJson);
  if (!verifier.verify(publicKeyPem, sigMatch[1].trim(), "base64")) {
    throw new Error("License signature is INVALID. Tampering detected!");
  }

  // 2. Hardware Binding Check
  if (payload.mac_address.toUpperCase() !== physicalMac.toUpperCase()) {
    throw new Error("License belongs to another computer (MAC Mismatch)!");
  }
  if (payload.hwid && physicalHwid && payload.hwid !== physicalHwid) {
    throw new Error("License belongs to another computer (HWID Mismatch)!");
  }

  // 3. Expiration Check
  if (payload.expires_at && new Date(payload.expires_at) < new Date()) {
    throw new Error("Your software license has expired!");
  }

  return payload; // Valid license
}
```

---

## NPM Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm start` | `node src/index.js` | Runs production server |
| `npm run dev` | `nodemon src/index.js` | Runs development server with hot-reloading |
| `npm run prisma:generate` | `prisma generate` | Re-generates Prisma Client types |
| `npm run prisma:push` | `prisma db push` | Pushes schema directly to PostgreSQL |
| `npm run prisma:migrate` | `prisma migrate dev`| Applies versioned database migrations |
| `npm run prisma:studio` | `prisma studio` | Launches web database viewer |
| `npm run prisma:seed` | `node src/database/seed.js`| Seeds administrator account |

---

## 🏛️ SOLID Architecture & Clean Code Design

The codebase strictly adheres to the **5 SOLID Principles**:

| Principle | Implementation in this Codebase |
| :--- | :--- |
| **S — Single Responsibility (SRP)** | • **Controllers** (`controllers/`): Strictly handle HTTP mapping and JSON serialization.<br>• **Services** (`services/`): Pure business logic, entitlement rules, and validation.<br>• **Repositories** (`repositories/`): Dedicated data access layer.<br>• **Crypto** (`crypto/`): Pure cryptographic signature generation. |
| **O — Open / Closed (OCP)** | • The `BaseLicenseSigner` contract in `crypto/rsaLicenseSigner.js` allows plugging in new signature formats (e.g. Ed25519 or JWT) without modifying existing activation business logic. |
| **L — Liskov Substitution (LSP)** | • Any class extending `BaseLicenseSigner` can be substituted into `LicenseService` without altering correctness. |
| **I — Interface Segregation (ISP)** | • Segregated repositories (`UserRepository`, `CustomerRepository`, `LicenseRepository`) rather than a bloated monolithic database helper. |
| **D — Dependency Inversion (DIP)** | • High-level services depend on repository contracts injected via constructors (`new LicenseService(licenseRepo, customerRepo, signer)`). Enables 100% testability with mock repositories. |

---

## 📂 Project Structure

```
Serial Key/
├── src/                                  # 100% Application Source Code
│   ├── index.js                          # Server bootstrap, Swagger UI, & graceful shutdown
│   ├── swagger.json                      # OpenAPI 3.0 specification
│   ├── config/                           # Configuration & Fail-Fast checks
│   │   └── env.js                        # Startup environment variable validation
│   ├── validators/                       # Schema Validation (Zod)
│   │   └── schemas.js                    # Request payload validation schemas
│   ├── middleware/                       # Middleware
│   │   ├── auth.js                       # JWT & Role-Based Access Control (requireRole)
│   │   ├── rateLimiter.js                # Express rate limiters for login & activation
│   │   └── validate.js                   # Zod request body validation middleware
│   ├── controllers/                      # HTTP Layer: Request parsing & status responses (SRP)
│   │   ├── authController.js
│   │   ├── customerController.js
│   │   ├── licenseController.js
│   │   └── serialKeyController.js
│   ├── services/                         # Domain Layer: Business rules & validation (SRP, DIP)
│   │   ├── authService.js
│   │   ├── customerService.js
│   │   └── licenseService.js
│   ├── repositories/                     # Data Access Layer: Prisma queries & transactions (DIP)
│   │   ├── userRepository.js
│   │   ├── customerRepository.js
│   │   └── licenseRepository.js
│   ├── crypto/                           # Cryptographic Strategy: Signer contracts (OCP, LSP)
│   │   └── rsaLicenseSigner.js
│   ├── database/                         # Prisma client singleton & seeder
│   │   ├── prisma.js
│   │   ├── init.js
│   │   ├── seed.js
│   │   └── db.js
│   ├── routes/                           # Express routing definitions
│   │   └── routes.js
│   └── utils/                            # Shared utilities
│       ├── clientMeta.js                 # User-Agent & IP extraction helper
│       └── logger.js                     # Structured Pino logger with pretty-printing
├── prisma/                               # Database Schema
│   └── schema.prisma
├── dist/                                 # Build artifacts
├── keys/                                 # RSA key certificates
├── .env                                  # Environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## License

Proprietary software for **Energy Monitoring System**. All rights reserved.
