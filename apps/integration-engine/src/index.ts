import { startMllpServer } from './mllp-server';
import { logger } from '@plincare/shared';
import express from 'express';
import { mapFhirToHl7Siu, wrapInMllp, SiuAction } from './mapping/fhir-to-hl7';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Integration Engine' });
});

/**
 * Endpoint pour déclencher un Write-Back SIU (HL7) suite à une action FHIR
 * Supporte: create (S12), update (S13), cancel (S15)
 */
app.post('/internal/write-back/siu', (req, res) => {
    try {
        const { appointment, patient, action = 'create' } = req.body;

        // Validation de l'action
        const validActions: SiuAction[] = ['create', 'update', 'cancel'];
        if (!validActions.includes(action)) {
            res.status(400).json({ error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}` });
            return;
        }

        const hl7Message = mapFhirToHl7Siu(appointment, patient, action as SiuAction);
        const mllpEnvelope = wrapInMllp(hl7Message);

        // Map action to SIU event type for logging
        const siuEventMap = { create: 'SIU^S12', update: 'SIU^S13', cancel: 'SIU^S15' };
        const siuEvent = siuEventMap[action as SiuAction];

        logger.info(`Write-Back ${siuEvent} Triggered`, {
            appointmentId: appointment.id,
            action,
            patientId: patient?.id
        });

        // Simulation d'envoi vers un HIS historique (on pourrait ouvrir un port client MLLP ici)
        // Pour cet agent, on loggue juste l'enveloppe prête à l'envoi
        logger.info('HL7 SIU Message Ready for Outbound', {
            event: siuEvent,
            length: hl7Message.length
        });

        res.status(200).json({
            status: 'sent',
            event: siuEvent,
            length: hl7Message.length
        });
    } catch (err: any) {
        logger.error('Write-Back SIU Failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

const HTTP_PORT = 3001;
app.listen(HTTP_PORT, () => {
    logger.info(`Integration Engine Internal API running on port ${HTTP_PORT}`);
});

logger.info('Starting Integration Engine MLLP Server...');
try {
    startMllpServer();
} catch (error) {
    logger.error('Failed to start Integration Engine', error);
    process.exit(1);
}
