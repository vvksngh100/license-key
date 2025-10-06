const jwt = require('jsonwebtoken');

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if(!authHeader || !authHeader.startsWith('Bearer ')){
            return res.status(401).json({error: 'Access denied. No token provided.'});
        }

        const token = authHeader.subString(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if(decoded){
            
        }
    } catch (error) {
        res.status(500).json({error: `Failed to fetch users data: ${error}`})
    }
}