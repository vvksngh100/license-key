const jwt = require("jsonwebtoken");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token =
      (authHeader && authHeader.startsWith("Bearer "))
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

    // Verify the token.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // For the expired the token.
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ status: false, message: "Token expired." });
    }
    // For the invalid token
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ status: false, message: "Invalid token." });
    }
    // Final message
    return res.status(500).json({
      status: false,
      message: `Failed to authenticate: ${error.message}`,
    });
  }
}

module.exports = { authMiddleware };
