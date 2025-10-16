const { pool } = require("../database/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const saltRounds = 10;

const users = async (req, res) => {
  try {
    const [users] = await pool.execute(`
        SELECT * FROM users;
        `);
    if (users.length === 0) {
      return res.status(200).json({
        status: true,
        message: "There is no records",
      });
    }
    res.status(200).json({
      status: true,
      message: "Fetched all users successfully.",
      users,
    });
  } catch (error) {
    console.log("Failed to fetch the users: ", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch the users data.",
      error,
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

    const query = username
      ? "SELECT * FROM users WHERE username = ?"
      : "SELECT * FROM users WHERE email = ?";
    const value = username || email;

    const [rows] = await pool.execute(query, [value]);
    console.log(rows);

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ message: "Authentication failed: Incorrect password." });
    }

    const payload = {
      username: user.username,
      email: user.email,
      user_id: user.user_id,
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
        id: user.id,
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
    const [users] = await pool.execute(
      `SELECT * FROM users WHERE username = ? OR email = ?`,
      [username, email]
    );

    if (users.length > 0) {
      return res.status(409).json({
        message: "A user with provided username/email already exists",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password, full_name, role) VALUES (?,?,?,?,?)`,
      [username, email, hashedPassword, full_name, role]
    );

    console.log(result);

    res.status(201).json({
      status: true,
      message: "User added successfully",
      id: result.insertId,
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
