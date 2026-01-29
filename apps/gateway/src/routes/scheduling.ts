import { Router, Request, Response } from 'express';
import { logger, auditLogger } from '@plincare/shared';

const router = Router();

// =============================================================================
// HealthcareService Endpoints
// =============================================================================

router.get('/HealthcareService', (req: Request, res: Response) => {
    logger.info('GET /HealthcareService - List all services');
    // TODO: Query PostgreSQL healthcare_services table
    res.json({ resourceType: 'Bundle', type: 'searchset', entry: [] });
});

router.get('/HealthcareService/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    logger.info(`GET /HealthcareService/${id}`);
    // TODO: Query by ID
    res.status(404).json({ error: 'Not found' });
});

router.post('/HealthcareService', (req: Request, res: Response) => {
    const resource = req.body;
    logger.info('POST /HealthcareService', { id: resource.id });

    auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: 'CREATE',
        resource_id: resource.id || 'NEW_RESOURCE',
        resource_type: 'FHIR_HEALTHCARESERVICE',
        outcome: 'success',
        details: { resource }
    });

    // TODO: Insert into PostgreSQL
    res.status(201).json({ ...resource, id: resource.id || `hcs-${Date.now()}` });
});

// =============================================================================
// Schedule Endpoints
// =============================================================================

router.get('/Schedule', (req: Request, res: Response) => {
    logger.info('GET /Schedule - List all schedules');
    // TODO: Query PostgreSQL schedules table
    res.json({ resourceType: 'Bundle', type: 'searchset', entry: [] });
});

router.get('/Schedule/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    logger.info(`GET /Schedule/${id}`);
    // TODO: Query by ID
    res.status(404).json({ error: 'Not found' });
});

router.post('/Schedule', (req: Request, res: Response) => {
    const resource = req.body;
    const resourceId = resource.id || `schedule-${Date.now()}`;

    logger.info('POST /Schedule', { id: resourceId });

    auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: 'CREATE',
        resource_id: resourceId,
        resource_type: 'FHIR_SCHEDULE',
        outcome: 'success',
        details: { actor: resource.actor }
    });

    // TODO: Insert into PostgreSQL
    res.status(201).json({ ...resource, id: resourceId });
});

// =============================================================================
// Slot Endpoints
// =============================================================================

router.get('/Slot', (req: Request, res: Response) => {
    const { schedule, status } = req.query;
    logger.info('GET /Slot', { schedule, status });

    // Filtering by schedule and status (e.g., ?schedule=Schedule/scanner-1&status=free)
    // TODO: Query PostgreSQL slots table with filters
    res.json({ resourceType: 'Bundle', type: 'searchset', entry: [] });
});

router.get('/Slot/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    logger.info(`GET /Slot/${id}`);
    // TODO: Query by ID
    res.status(404).json({ error: 'Not found' });
});

router.post('/Slot', (req: Request, res: Response) => {
    const resource = req.body;
    const resourceId = resource.id || `slot-${Date.now()}`;

    logger.info('POST /Slot', { id: resourceId });

    auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: 'CREATE',
        resource_id: resourceId,
        resource_type: 'FHIR_SLOT',
        outcome: 'success',
        details: { schedule: resource.schedule, status: resource.status }
    });

    // TODO: Insert into PostgreSQL
    res.status(201).json({ ...resource, id: resourceId });
});

// =============================================================================
// Appointment Endpoints (with Write-Back trigger)
// =============================================================================

const INTEGRATION_ENGINE_URL = process.env.INTEGRATION_ENGINE_URL || 'http://localhost:3001';

router.get('/Appointment', (req: Request, res: Response) => {
    const { patient, status } = req.query;
    logger.info('GET /Appointment', { patient, status });
    // TODO: Query PostgreSQL appointments table
    res.json({ resourceType: 'Bundle', type: 'searchset', entry: [] });
});

router.get('/Appointment/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    logger.info(`GET /Appointment/${id}`);
    // TODO: Query by ID
    res.status(404).json({ error: 'Not found' });
});

router.post('/Appointment', async (req: Request, res: Response) => {
    const resource = req.body;
    const resourceId = resource.id || `apt-${Date.now()}`;

    logger.info('POST /Appointment - Creating new appointment', { id: resourceId });

    auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: 'CREATE',
        resource_id: resourceId,
        resource_type: 'FHIR_APPOINTMENT',
        outcome: 'success',
        details: { status: resource.status }
    });

    // TODO: Insert into PostgreSQL

    // Trigger Write-Back SIU^S12 (new appointment)
    try {
        const patientRef = resource.participant?.find((p: any) => p.actor?.reference?.startsWith('Patient/'));
        const patientId = patientRef?.actor?.reference?.replace('Patient/', '') || 'UNKNOWN';

        const response = await fetch(`${INTEGRATION_ENGINE_URL}/internal/write-back/siu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create',
                appointment: { ...resource, id: resourceId },
                patient: { id: patientId }
            })
        });

        if (response.ok) {
            logger.info('Write-Back SIU^S12 triggered successfully', { appointmentId: resourceId });
        } else {
            logger.warn('Write-Back SIU^S12 failed', { status: response.status });
        }
    } catch (err: any) {
        logger.error('Write-Back SIU^S12 error', { error: err.message });
    }

    res.status(201).json({ ...resource, id: resourceId });
});

router.patch('/Appointment/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;

    logger.info(`PATCH /Appointment/${id}`, { updates });

    // Determine if this is a cancellation
    const isCancellation = updates.status === 'cancelled';
    const actionType = isCancellation ? 'cancel' : 'update';
    const siuType = isCancellation ? 'SIU^S15' : 'SIU^S13';

    auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: isCancellation ? 'CANCEL' : 'UPDATE',
        resource_id: id,
        resource_type: 'FHIR_APPOINTMENT',
        outcome: 'success',
        details: { updates }
    });

    // TODO: Update in PostgreSQL

    // Trigger Write-Back SIU^S13 (update) or SIU^S15 (cancel)
    try {
        const response = await fetch(`${INTEGRATION_ENGINE_URL}/internal/write-back/siu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: actionType,
                appointment: { id, ...updates },
                patient: { id: 'PATIENT_FROM_DB' } // TODO: Fetch from DB
            })
        });

        if (response.ok) {
            logger.info(`Write-Back ${siuType} triggered successfully`, { appointmentId: id });
        } else {
            logger.warn(`Write-Back ${siuType} failed`, { status: response.status });
        }
    } catch (err: any) {
        logger.error(`Write-Back ${siuType} error`, { error: err.message });
    }

    res.json({ id, ...updates, meta: { lastUpdated: new Date().toISOString() } });
});

export default router;
