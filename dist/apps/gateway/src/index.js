"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shared_1 = require("@plincare/shared");
const app = (0, express_1.default)();
const PORT = 3000;
app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Gateway' });
});
app.listen(PORT, () => {
    shared_1.logger.info(`Gateway running on port ${PORT}`);
    shared_1.logger.info('TLS 1.3 support prepared in configuration placeholders');
});
