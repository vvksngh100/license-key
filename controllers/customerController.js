const express = require('express');
const { pool } = require('../database/db');


const customers = async(req, res) => {
    try{
        const [customers] = await pool.execute(`SELECT * FROM customers`);
        if(customers.length === 0){
            return res.status(200).json({
                status: true,
                message: "No record found"
            });
        }
        return res.status(200).json({
            status: true,
            message: "Fetched all customers details successfully",
            customers
        })
    } catch(error){
        return res.status(500).json({
            status: false,
            message: "Failed to fetch the customers details",
            error: error
        })
    }
}




module.exports = {customers};