const { pool } = require('../database/db');

const registerLicense = async(req, res) => {
    const maxTries = 5;
    try {
        const { mac_address, serial_key } = req.body;
        const [licenseData] = await pool.execute(`SELECT * FROM licenses WHERE serial_key = ?`, [serial_key]);
        if(licenseData.length === 0){
            return res.status(401).json({
                status: false,
                message: "Invalid Serial key"
            });
        } else if(licenseData[0].status !== 'inactive' || licenseData[0].activation_date !== null){
            return res.status(401).json({
                status: false,
                message: "Serial key is already activated"
            });
        }

    } catch (error) {
        
    }
}

module.exports = { registerLicense };