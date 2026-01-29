import express from 'express';
import { logger, auditLogger } from '@plincare/shared';
import schedulingRoutes from './routes/scheduling';

const app = express();
app.use(express.json());

const PORT = 3000;

app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Gateway' });
});

// Mount scheduling routes (Phase 5)
app.use('/api/fhir', schedulingRoutes);

// Generic FHIR ingestion endpoint for other resource types
app.post('/api/fhir/:resourceType', (req, res) => {
    const resource = req.body;
    const { resourceType } = req.params;

    // Skip if already handled by scheduling routes
    if (['Schedule', 'Slot', 'Appointment', 'HealthcareService'].includes(resourceType)) {
        return; // Already handled by schedulingRoutes
    }

    logger.info(`FHIR ${resourceType} received at Gateway`, { id: resource.id });

    // Validation Ségur / UCUM pour les Observations
    if (resourceType === 'Observation' && resource.valueQuantity) {
        const { system } = resource.valueQuantity;
        if (system !== 'http://unitsofmeasure.org') {
            logger.warn('Compliance Warning: Observation valueQuantity system is NOT UCUM', { id: resource.id });
        } else {
            logger.info('Compliance Success: UCUM units verified', { id: resource.id });
        }
    }

    // Ségur Audit Trail: Ingestion
    auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: 'CREATE',
        resource_id: resource.id || 'NEW_RESOURCE',
        resource_type: `FHIR_${resourceType.toUpperCase()}`,
        outcome: 'success',
        details: {
            resource_type: resourceType,
            id: resource.id
        }
    });

    res.status(201).json({ status: 'Created', id: resource.id });
});

app.listen(PORT, () => {
    logger.info(`Gateway running on port ${PORT}`);
    logger.info('Ingestion FHIR active sur /api/fhir/');
    logger.info('Scheduling APIs (Phase 5) mounted: Schedule, Slot, Appointment, HealthcareService');
});

