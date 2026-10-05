const { AuthService } = require("../services/authService");
const { extractClientMeta } = require("../utils/clientMeta");

const defaultAuthService = new AuthService();

const login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const meta = extractClientMeta(req);
    const result = await defaultAuthService.login({ username, email, password, meta });

    return res.status(200).json({
      status: true,
      message: "Logged in successfully.",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { email, username, password, full_name, role } = req.body;
    const result = await defaultAuthService.createUser({
      email,
      username,
      password,
      full_name,
      role,
    });

    return res.status(201).json({
      status: true,
      message: "User added successfully",
      id: result.userId,
    });
  } catch (error) {
    next(error);
  }
};

const users = async (req, res, next) => {
  try {
    const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10)) : null;
    const limit = req.query.limit ? Math.max(1, parseInt(req.query.limit, 10)) : null;

    const result = await defaultAuthService.getUsers({ page, limit });

    const response = {
      status: true,
      message: "Fetched all users successfully.",
      users: result.users,
    };

    if (result.total !== null) {
      response.pagination = {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      };
    }

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  createUser,
  users,
};
