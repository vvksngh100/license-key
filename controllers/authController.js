const { prisma } = require("../database/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const saltRounds = 10;

const users = async (req, res) => {
  try {
    const userRecords = await prisma.skUser.findMany({
      select: {
        userId: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
        recver: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (userRecords.length === 0) {
      return res.status(200).json({
        status: true,
        message: "There is no records",
      });
    }

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

    res.status(200).json({
      status: true,
      message: "Fetched all users successfully.",
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Failed to fetch users: ", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch the users data.",
      error: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res
        .status(400)
        .json({ message: "Email/username and password are mandatory." });
    }

    const user = await prisma.skUser.findFirst({
      where: username ? { username } : { email },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ message: "Authentication failed: Incorrect password." });
    }

    // Update last login timestamp
    await prisma.skUser.update({
      where: { userId: user.userId },
      data: { lastLogin: new Date() },
    });

    const payload = {
      username: user.username,
      email: user.email,
      user_id: user.userId,
      role: user.role,
    };

    const jwtSecret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

    // Generate token
    const token = jwt.sign(payload, jwtSecret, { expiresIn });

    return res.status(200).json({
      status: true,
      message: "Logged in successfully.",
      token,
      user: {
        user_id: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};

const createUser = async (req, res) => {
  try {
    const { email, username, password, full_name, role } = req.body;

    if (!email || !username || !password || !full_name || !role) {
      return res.status(400).json({ message: "All fields are mandatory." });
    }

    // Check if username or email already exist
    const existingUser = await prisma.skUser.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "A user with provided username/email already exists",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const newUser = await prisma.skUser.create({
      data: {
        username,
        email,
        password: hashedPassword,
        fullName: full_name,
        role,
      },
    });

    res.status(201).json({
      status: true,
      message: "User added successfully",
      id: newUser.userId,
    });
  } catch (error) {
    console.error("Error while creating a user:", error);
    res.status(500).json({
      status: false,
      message: "Failed to add a new user",
      error: error.message,
    });
  }
};

module.exports = { users, login, createUser };
