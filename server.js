const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database/init');
const router = require('./routes/routes');

const app = express();

const port = 3002;


// Middleware
app.use(cors());
app.use(express.json());

// Database
initializeDatabase();

// app.use('/api',router);

app.get('/', (req,res) => {
    res.send('server is running');
})

app.listen(port,() => {
    console.log(`Server is started on ${port}`);
});