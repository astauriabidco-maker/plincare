import express from 'express';
import path from 'path';
import { logger, auditLogger } from '@plincare/shared';
import schedulingRoutes from './routes/scheduling';
import dmpRoutes from './routes/dmp';
import mssanteRoutes from './routes/mssante';
import crashTestRoutes from './routes/crash-test';

const app = express();
app.use(express.json());

// Serve static files (dashboard)
app.use('/static', express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3010;

app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Gateway' });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/demo-dashboard.html'));
});

// Mount scheduling routes (Phase 5)
app.use('/api/fhir', schedulingRoutes);

// Mount DMP routes (Phase 6 - CDA Generation)
app.use('/api/dmp', dmpRoutes);

// Mount MSSanté routes (Phase 7 - Secure Messaging)
app.use('/api/mssante', mssanteRoutes);

// Mount Crash Test routes (Ségur Conformity)
app.use('/api/crash-test', crashTestRoutes);

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
    logger.info('DMP APIs (Phase 6) mounted: /api/dmp/generate-cda, /api/dmp/validate-cda');
    logger.info('MSSanté APIs (Phase 7) mounted: /api/mssante/send, /api/mssante/lookup-rpps');
    logger.info('Crash Test APIs mounted: /api/crash-test/run-all, /api/crash-test/dashboard');
    logger.info(`Dashboard accessible sur http://localhost:${PORT}/dashboard`);
});

