const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database/init');
const router = require('./routes/routes');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 3002;


// Security & Proxy
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Database
initializeDatabase();

app.use('/api',router);

app.get('/', (req,res) => {
    res.send('server is running');
})

app.listen(port,() => {
    console.log(`Server is started on ${port}`);
});