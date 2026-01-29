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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMllpServer = startMllpServer;
const net = __importStar(require("net"));
const shared_1 = require("@plincare/shared");
const patient_validator_1 = require("./validation/patient-validator");
const axios_1 = __importDefault(require("axios"));
const PORT = 2100;
const VT = String.fromCharCode(0x0b); // Vertical Tab (Start of block)
const FS = String.fromCharCode(0x1c); // File Separator (End of block)
const CR = String.fromCharCode(0x0d); // Carriage Return (Trailer)
function startMllpServer() {
    const server = net.createServer((socket) => {
        shared_1.logger.info('New connection established');
        let buffer = '';
        socket.on('data', async (data) => {
            buffer += data.toString();
            if (buffer.includes(VT) && buffer.includes(FS + CR)) {
                const start = buffer.indexOf(VT) + 1;
                const end = buffer.indexOf(FS + CR);
                const message = buffer.substring(start, end);
                shared_1.logger.info('HL7 Message Received', { raw: message });
                // 1. Audit Trail: Reception
                shared_1.auditLogger.log({
                    actor_id: 'MLLP_ADAPTER',
                    action_type: 'RECEIVE',
                    resource_id: 'HL7_MSG_' + Date.now(),
                    resource_type: 'HL7_V2',
                    outcome: 'success',
                    details: { length: message.length }
                });
                try {
                    // 2. Mapping HL7 to FHIR
                    const fhirPatient = mapHl7ToFhirPatient(message);
                    // 3. Validation Ségur
                    const validationResult = (0, patient_validator_1.validatePatient)(fhirPatient);
                    if (!validationResult.valid) {
                        shared_1.logger.warn('Validation Failed', { error: validationResult.error });
                        shared_1.auditLogger.log({
                            actor_id: 'INTEGRATION_ENGINE',
                            action_type: 'VALIDATE',
                            resource_id: fhirPatient.id || 'NEW_PATIENT',
                            resource_type: 'FHIR_PATIENT',
                            outcome: 'failure',
                            details: { error: validationResult.error }
                        });
                        // Dans un scénario Ségur, on pourrait quand même envoyer ou rejeter au niveau MLLP
                    }
                    else {
                        shared_1.logger.info('Validation Success');
                        shared_1.auditLogger.log({
                            actor_id: 'INTEGRATION_ENGINE',
                            action_type: 'VALIDATE',
                            resource_id: fhirPatient.id || 'NEW_PATIENT',
                            resource_type: 'FHIR_PATIENT',
                            outcome: 'success'
                        });
                    }
                    // 4. Send to Gateway
                    try {
                        const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000/api/fhir/Patient';
                        await axios_1.default.post(gatewayUrl, fhirPatient);
                        shared_1.logger.info('Sent to Gateway');
                    }
                    catch (gwError) {
                        shared_1.logger.error('Failed to send to Gateway', { error: gwError.message });
                    }
                }
                catch (err) {
                    shared_1.logger.error('Processing Error', { error: err.message });
                    shared_1.auditLogger.log({
                        actor_id: 'INTEGRATION_ENGINE',
                        action_type: 'TRANSFORM',
                        resource_id: 'ERROR',
                        resource_type: 'HL7_V2',
                        outcome: 'failure',
                        details: { error: err.message }
                    });
                }
                // Send ACK (Minimal MSH-ACK)
                const ack = VT + 'MSH|^~\\&|PFI|PHARMACIE|SENDER|APP|' + new Date().toISOString() + '||ACK^A01|123|P|2.5' + CR + FS + CR;
                socket.write(ack);
                buffer = buffer.substring(end + 2);
            }
        });
        socket.on('error', (err) => {
            shared_1.logger.error('Socket error', err);
        });
    });
    server.listen(PORT, '0.0.0.0', () => {
        shared_1.logger.info(`MLLP Listener running on port ${PORT}`);
    });
}
