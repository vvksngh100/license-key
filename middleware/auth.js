const jwt = require("jsonwebtoken");
const { prisma } = require("../database/prisma");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : req.cookies?.token;

    // Check for the token
    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Access denied. No token provided.",
      });
    }

    // Check for the JWT_SECRET
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET not set in environment variables");
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // If role is missing from token payload, fetch from DB
    if (!req.user.role && req.user.user_id) {
      const dbUser = await prisma.skUser.findUnique({
        where: { userId: req.user.user_id },
        select: { role: true, isActive: true },
      });
      if (dbUser) {
        if (!dbUser.isActive) {
          return res.status(403).json({
            status: false,
            message: "User account has been deactivated.",
          });
        }
        req.user.role = dbUser.role;
      }
    }

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ status: false, message: "Token expired." });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ status: false, message: "Invalid token." });
    }
    return res.status(500).json({
      status: false,
      message: `Failed to authenticate: ${error.message}`,
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware
 * @param  {...string} allowedRoles Roles that are permitted to access the route
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized. Authentication required.",
      });
    }

    const userRole = req.user.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: false,
        message: `Forbidden. Requires one of roles: [${allowedRoles.join(", ")}]. Current role: '${userRole || "none"}'`,
      });
    }

    next();
  };
}

module.exports = { authMiddleware, requireRole };
