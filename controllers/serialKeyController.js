const express = require('express');
const { getNetworkDetails} = require('../utility/getSystemDetails');

const generateSerialKey = () => {
    console.log(getNetworkDetails())
}

generateSerialKey();