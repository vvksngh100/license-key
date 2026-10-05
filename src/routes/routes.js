const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/auth");
const { loginLimiter, activationLimiter } = require("../middleware/rateLimiter");
const { validateBody } = require("../middleware/validate");
const {
  loginSchema,
  createUserSchema,
  generateSerialKeySchema,
  registerLicenseSchema,
  validateLicenseSchema,
  revokeLicenseSchema,
  deactivateDeviceSchema,
} = require("../validators/schemas");

const { users, login, createUser } = require("../controllers/authController");
const { generateSerialKey } = require("../controllers/serialKeyController");
const { customers } = require("../controllers/customerController");
const {
  registerLicense,
  validateLicense,
  revokeLicense,
  deactivateDevice,
} = require("../controllers/licenseController");

const router = express.Router();

// ==========================================
// Authentication Routes
// ==========================================
router.post("/auth/login", loginLimiter, validateBody(loginSchema), login);
router.get("/auth/me", authMiddleware, (req, res) => {
  res.status(200).json({
    status: true,
    message: "Authenticated user details",
    user: req.user,
  });
});

// Admin-only user management
router.get("/auth/users", authMiddleware, requireRole("admin"), users);
router.post(
  "/auth/create-user",
  authMiddleware,
  requireRole("admin"),
  validateBody(createUserSchema),
  createUser
);

// ==========================================
// Customer & Serial Key Generation (Admin & Sales)
// ==========================================
router.get(
  "/auth/customers",
  authMiddleware,
  requireRole("admin", "sales", "engineer"),
  customers
);
router.post(
  "/auth/serial-key",
  authMiddleware,
  requireRole("admin", "sales"),
  validateBody(generateSerialKeySchema),
  generateSerialKey
);

// ==========================================
// Client Hardware Activation & Heartbeat (Public / Rate-limited)
// ==========================================
router.post(
  "/auth/register-license",
  activationLimiter,
  validateBody(registerLicenseSchema),
  registerLicense
);
router.post(
  "/auth/validate-license",
  activationLimiter,
  validateBody(validateLicenseSchema),
  validateLicense
);

// ==========================================
// License Administration & Revocation (Admin-only)
// ==========================================
router.post(
  "/auth/revoke-license",
  authMiddleware,
  requireRole("admin"),
  validateBody(revokeLicenseSchema),
  revokeLicense
);
router.post(
  "/auth/deactivate-device",
  authMiddleware,
  requireRole("admin"),
  validateBody(deactivateDeviceSchema),
  deactivateDevice
);

module.exports = router;
