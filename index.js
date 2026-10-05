const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { initializeDatabase } = require('./database/init');
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

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
  console.log(`Interactive Swagger Docs available at http://localhost:${port}/api-docs`);
});