/**
 * CommonJS wrapper for socket.ts TypeScript module
 * This allows server.js to import the TypeScript module
 */

// Re-export socket.ts functionality
const socketModule = require('./socket.ts');

module.exports = {
  initializeCallSocket: socketModule.initializeCallSocket,
};
