"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mllp_server_1 = require("./mllp-server");
const shared_1 = require("@plincare/shared");
shared_1.logger.info('Starting Integration Engine...');
try {
    (0, mllp_server_1.startMllpServer)();
}
catch (error) {
    shared_1.logger.error('Failed to start Integration Engine', error);
    process.exit(1);
}
