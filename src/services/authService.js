const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { UserRepository } = require("../repositories/userRepository");
const { logger } = require("../utils/logger");
require("dotenv").config();

const saltRounds = 10;

class AuthService {
  constructor(userRepository = new UserRepository()) {
    this.userRepo = userRepository;
  }

  async login({ username, email, password, meta = {} }) {
    if ((!username && !email) || !password) {
      const err = new Error("Email/username and password are mandatory.");
      err.statusCode = 400;
      throw err;
    }

    const identifier = username || email;
    const user = await this.userRepo.findByUsernameOrEmail(identifier);

    // 1. User does not exist (Log forensic truth internally, return generic error to client)
    if (!user) {
      logger.warn(
        { identifier, ip: meta.ipAddress, userAgent: meta.userAgent },
        "Login failed: User not found in database"
      );
      const err = new Error("Invalid username/email or password.");
      err.statusCode = 401;
      throw err;
    }

    // 2. User exists but is deactivated
    if (!user.isActive) {
      logger.warn(
        { identifier, userId: user.userId, ip: meta.ipAddress },
        "Login failed: Account is deactivated"
      );
      const err = new Error("Account is deactivated. Please contact an administrator.");
      err.statusCode = 403;
      throw err;
    }

    // 3. Password comparison failed (Log forensic truth internally, return generic error to client)
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      logger.warn(
        { identifier, userId: user.userId, ip: meta.ipAddress },
        "Login failed: Incorrect password attempt"
      );
      const err = new Error("Invalid username/email or password.");
      err.statusCode = 401;
      throw err;
    }

    // 4. Login successful
    logger.info(
      { identifier, userId: user.userId, role: user.role, ip: meta.ipAddress },
      "User logged in successfully"
    );

    // Update last login timestamp
    await this.userRepo.updateLastLogin(user.userId);

    const payload = {
      username: user.username,
      email: user.email,
      user_id: user.userId,
      role: user.role,
    };

    const jwtSecret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

    const token = jwt.sign(payload, jwtSecret, { expiresIn });

    return {
      token,
      user: {
        user_id: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async createUser({ email, username, password, full_name, role }) {
    if (!email || !username || !password || !full_name || !role) {
      const err = new Error("All fields are mandatory.");
      err.statusCode = 400;
      throw err;
    }

    const existingUser = await this.userRepo.findByUsernameOrEmail(username) ||
      await this.userRepo.findByUsernameOrEmail(email);

    if (existingUser) {
      const err = new Error("A user with provided username/email already exists");
      err.statusCode = 409;
      throw err;
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await this.userRepo.create({
      username,
      email,
      password: hashedPassword,
      fullName: full_name,
      role,
    });

    return {
      userId: newUser.userId,
    };
  }

  async getUsers({ page, limit } = {}) {
    const queryOpts = {};
    let total = null;

    if (page && limit) {
      total = await this.userRepo.count();
      queryOpts.skip = (page - 1) * limit;
      queryOpts.take = limit;
    }

    const userRecords = await this.userRepo.findMany(queryOpts);

    const formattedUsers = userRecords.map((u) => ({
      user_id: u.userId,
      username: u.username,
      email: u.email,
      full_name: u.fullName,
      role: u.role,
      is_active: u.isActive,
      created_at: u.createdAt,
      last_login: u.lastLogin,
      recver: u.recver,
    }));

    return {
      users: formattedUsers,
      total,
      page,
      limit,
    };
  }
}

module.exports = { AuthService };
