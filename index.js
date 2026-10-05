const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { initializeDatabase } = require('./database/init');
const { prisma } = require('./database/prisma');
const router = require('./routes/routes');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 3002;

// Security & Reverse Proxy IP Trust
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Database Initialization & Seed
initializeDatabase();

// Interactive OpenAPI 3.0 / Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API Routes
app.use('/api', router);

// Root Health Check & API Docs redirect
app.get('/', (req, res) => {
  res.json({
    status: true,
    service: 'Industrial Licensing & Device Activation Engine',
    docs: '/api-docs',
    timestamp: new Date().toISOString(),
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;

  // Differentiate expected client errors (4xx) from critical server crashes (5xx)
  if (statusCode >= 500) {
    console.error(`💥 [${statusCode} Server Error] ${req.method} ${req.originalUrl || req.url}:`, err);
  } else {
    console.warn(`⚠️  [${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${err.message}`);
  }

  res.status(statusCode).json({
    status: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && statusCode >= 500 ? { stack: err.stack } : {}),
  });
});

// Start HTTP Server
const server = app.listen(port, () => {
  console.log(`Server started on port ${port}`);
  console.log(`Interactive Swagger Docs available at http://localhost:${port}/api-docs`);
});

// Graceful shutdown to release Prisma connection pool on Supabase
const handleShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Database connection pool closed successfully.");
      process.exit(0);
    } catch (e) {
      console.error("Error closing Prisma connection:", e);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));