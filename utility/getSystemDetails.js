const os = require('os');
// import os from 'os';

function getNetworkDetails() {
  const networkInterfaces = os.networkInterfaces();
  const details = {};

  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      // Filter for IPv4 addresses and exclude internal (loopback) interfaces
      if (iface.family === 'IPv4' && !iface.internal) {
        details[interfaceName] = {
          ipAddress: iface.address,
          macAddress: iface.mac
        };
      }
    }
  }
  return details;
}

module.exports = { getNetworkDetails };