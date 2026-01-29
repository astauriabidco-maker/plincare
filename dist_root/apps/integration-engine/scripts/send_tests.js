"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);
async function sendHl7(filePath) {
    const filename = path.basename(filePath);
    console.log(`\nTesting scenario: ${filename}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const message = VT + content + FS + CR;
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.connect(2100, 'localhost', () => {
            console.log(`Connected to MLLP server. Sending ${filename}...`);
            client.write(message);
        });
        client.on('data', (data) => {
            console.log(`Received ACK for ${filename}: ${data.toString().substring(0, 50)}...`);
            client.destroy();
            resolve(true);
        });
        client.on('error', (err) => {
            console.error(`Error sending ${filename}:`, err.message);
            reject(err);
        });
        client.on('close', () => {
            // console.log('Connection closed');
        });
    });
}
async function runTests() {
    const testDir = path.join(__dirname, '../test-messages');
    const files = ['perfect.hl7', 'degraded.hl7', 'critical.hl7'];
    for (const file of files) {
        try {
            await sendHl7(path.join(testDir, file));
            // Wait a bit for processing
            await new Promise(r => setTimeout(r, 1000));
        }
        catch (e) {
            console.error(`Test failed for ${file}`);
        }
    }
}
runTests();
