const express= require('express');
const {pool} = require('../database/db');
const jwt = require('jsonwebtoken');


const users = (req, res) => {

    const [users] = pool.execute(`
        SELECT * FROM users;
        `);
    
}