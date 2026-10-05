const UAParser = require("ua-parser-js");

function extractClientMeta(req) {
  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",").shift()?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  const parser = new UAParser(userAgent);
  const uaResult = parser.getResult();

  return {
    ipAddress,
    userAgent,
    browserName: uaResult.browser.name || null,
    browserVersion: uaResult.browser.version || null,
    operatingSystem: uaResult.os.name || null,
    deviceType: uaResult.device.type || "desktop",
  };
}

module.exports = { extractClientMeta };
