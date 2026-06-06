const fs = require('node:fs');
const path = require('node:path');
const winston = require('winston');

function createLogger(logDir) {
  fs.mkdirSync(logDir, { recursive: true });

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({ filename: path.join(logDir, 'desktop.log') }),
      new winston.transports.Console({
        format: winston.format.simple()
      })
    ]
  });
}

module.exports = { createLogger };
