const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { users, login, createUser } = require('../controllers/authController');
const { generateSerialKey } = require('../controllers/serialKeyController');
const { customers } = require('../controllers/customerController');

const router = express.Router();

router.post('/auth/login', login);
router.get('/auth/users', authMiddleware, users);
router.post('/auth/create-user', authMiddleware, createUser);
router.get('/auth/me', authMiddleware, (req, res) => {
  res.status(200).json({
    status: true,
    message: "Authenticated user details",
    user: req.user,
  });
});
router.post('/auth/serial-key', authMiddleware, generateSerialKey);
router.get('/auth/customers', authMiddleware, customers);

module.exports = router;
