const { z } = require("zod");

const loginSchema = z
  .object({
    username: z.string().trim().optional(),
    email: z.string().trim().email("Invalid email format").optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine((data) => data.username || data.email, {
    message: "Either username or email must be provided",
    path: ["username"],
  });

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username cannot exceed 50 characters"),
  email: z.string().trim().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  role: z.enum(["admin", "sales", "engineer"], {
    errorMap: () => ({ message: "Role must be 'admin', 'sales', or 'engineer'" }),
  }),
});

const generateSerialKeySchema = z.object({
  email: z.string().trim().email("Invalid customer email format"),
  company_name: z.string().trim().optional(),
  contact_person: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  country: z.string().trim().optional(),
  product_version: z.string().trim().default("1.0.0"),
  license_type: z.enum(["trial", "enterprise"]).default("trial"),
  validity_days: z.coerce.number().int().positive("Validity days must be a positive integer").optional(),
  max_devices: z.coerce.number().int().min(1, "Max devices must be at least 1").default(1),
});

const registerLicenseSchema = z.object({
  serial_key: z
    .string()
    .trim()
    .min(16, "Serial key must be at least 16 characters"),
  mac_address: z
    .string()
    .trim()
    .min(1, "MAC address is required"),
  hwid: z.string().trim().optional(),
  device_name: z.string().trim().min(1, "Device name is required"),
  ip_address: z.string().trim().optional(),
});

const validateLicenseSchema = z.object({
  serial_key: z.string().trim().min(16, "Serial key must be at least 16 characters"),
  mac_address: z.string().trim().min(1, "MAC address is required"),
  hwid: z.string().trim().optional(),
});

const revokeLicenseSchema = z
  .object({
    serial_key: z.string().trim().optional(),
    license_id: z.string().uuid("Invalid license_id UUID format").optional(),
    reason: z.string().trim().optional(),
  })
  .refine((data) => data.serial_key || data.license_id, {
    message: "Either serial_key or license_id must be provided to revoke",
    path: ["serial_key"],
  });

const deactivateDeviceSchema = z.object({
  activation_id: z.string().uuid("Invalid activation_id UUID format"),
  reason: z.string().trim().optional(),
});

module.exports = {
  loginSchema,
  createUserSchema,
  generateSerialKeySchema,
  registerLicenseSchema,
  validateLicenseSchema,
  revokeLicenseSchema,
  deactivateDeviceSchema,
};
