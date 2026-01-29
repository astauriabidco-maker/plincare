import { startMllpServer } from './mllp-server';
import { logger } from '@plincare/shared';
import express from 'express';
import { mapFhirToHl7Siu, wrapInMllp } from './mapping/fhir-to-hl7';

const app = express();
app.use(express.json());

// Endpoint pour déclencher un Write-Back SIU (HL7) suite à une action FHIR
app.post('/internal/write-back/siu', (req, res) => {
    try {
        const { appointment, patient } = req.body;
        const hl7Message = mapFhirToHl7Siu(appointment, patient);
        const mllpEnvelope = wrapInMllp(hl7Message);
        
        logger.info('Write-Back SIU Triggered', { appointmentId: appointment.id });
        
        // Simulation d'envoi vers un HIS historique (on pourrait ouvrir un port client MLLP ici)
        // Pour cet agent, on loggue juste l'enveloppe prête à l'envoi
        logger.info('HL7 SIU Message Ready for Outbound', { raw: mllpEnvelope });
        
        res.status(200).json({ status: 'sent', length: hl7Message.length });
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
