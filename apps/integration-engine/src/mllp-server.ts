import * as net from 'net';
import { logger, auditLogger } from '@plincare/shared';
import { mapHl7ToFhir } from './mapping/hl7-to-fhir';
import { validatePatient } from './validation/patient-validator';
import axios from 'axios';

const PORT = 2100;
const VT = String.fromCharCode(0x0b); // Vertical Tab (Start of block)
const FS = String.fromCharCode(0x1c); // File Separator (End of block)
const CR = String.fromCharCode(0x0d); // Carriage Return (Trailer)

export function startMllpServer() {
    const server = net.createServer((socket) => {
        logger.info('New connection established');
        let buffer = '';

        socket.on('data', async (data) => {
            buffer += data.toString();

            if (buffer.includes(VT) && buffer.includes(FS + CR)) {
                const start = buffer.indexOf(VT) + 1;
                const end = buffer.indexOf(FS + CR);
                const message = buffer.substring(start, end);

                logger.info('HL7 Message Received', { raw: message });

                // 1. Audit Trail: Reception
                auditLogger.log({
                    actor_id: 'MLLP_ADAPTER',
                    action_type: 'RECEIVE',
                    resource_id: 'HL7_MSG_' + Date.now(),
                    resource_type: 'HL7_V2',
                    outcome: 'success',
                    details: { length: message.length }
                });

                try {
                    // 2. Mapping HL7 to FHIR (can return multiple resources for ORU)
                    const fhirResources = mapHl7ToFhir(message);

                    for (const resource of fhirResources) {
                        // 3. Validation Ségur (Patient specific)
                        if (resource.resourceType === 'Patient') {
                            const validationResult = validatePatient(resource);

                            if (!validationResult.valid) {
                                logger.warn('Patient Validation Failed', { error: validationResult.error });
                                auditLogger.log({
                                    actor_id: 'INTEGRATION_ENGINE',
                                    action_type: 'VALIDATE',
                                    resource_id: resource.id,
                                    resource_type: 'FHIR_PATIENT',
                                    outcome: 'failure',
                                    details: { error: validationResult.error }
                                });
                            } else {
                                logger.info('Patient Validation Success');
                                auditLogger.log({
                                    actor_id: 'INTEGRATION_ENGINE',
                                    action_type: 'VALIDATE',
                                    resource_id: resource.id,
                                    resource_type: 'FHIR_PATIENT',
                                    outcome: 'success'
                                });
                            }
                        }

                        // 4. Send to Gateway
                        try {
                            const gatewayUrl = `${process.env.GATEWAY_URL || 'http://localhost:3000'}/api/fhir/${resource.resourceType}`;
                            await axios.post(gatewayUrl, resource);
                            logger.info(`Sent ${resource.resourceType} to Gateway`, { id: resource.id });
                        } catch (gwError: any) {
                            logger.error(`Failed to send ${resource.resourceType} to Gateway`, { error: gwError.message });
                        }
                    }

                } catch (err: any) {
                    logger.error('Processing Error', { error: err.message });
                    auditLogger.log({
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
            logger.error('Socket error', err);
        });
    });

    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`MLLP Listener running on port ${PORT}`);
    });
}
