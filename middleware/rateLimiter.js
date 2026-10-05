const rateLimit = require("express-rate-limit");

// Protects login endpoint against brute-force password guessing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many login attempts from this IP, please try again after 15 minutes.",
  },
});

// Protects public license registration against brute-force serial key scanning
const activationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 registration/validation requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many license activation attempts, please slow down.",
  },
});

// General API protection
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many requests, please try again later.",
  },
});

module.exports = {
  loginLimiter,
  activationLimiter,
  generalLimiter,
};
