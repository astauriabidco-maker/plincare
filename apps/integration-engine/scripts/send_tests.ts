import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);

async function sendHl7(filePath: string) {
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
    const files = ['perfect.hl7', 'degraded.hl7', 'critical.hl7', 'biology.hl7', 'radiology.hl7'];

    for (const file of files) {
        try {
            await sendHl7(path.join(testDir, file));
            // Wait a bit for processing
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error(`Test failed for ${file}`);
        }
    }
}

runTests();
