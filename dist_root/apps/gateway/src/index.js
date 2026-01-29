"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shared_1 = require("@plincare/shared");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3000;
app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Gateway' });
});
// Endpoint pour recevoir les ressources FHIR Patient
app.post('/api/fhir/Patient', (req, res) => {
    const patient = req.body;
    shared_1.logger.info('FHIR Patient received at Gateway', { id: patient.id });
    // Ségur Audit Trail: Ingestion
    shared_1.auditLogger.log({
        actor_id: 'GATEWAY_API',
        action_type: 'CREATE',
        resource_id: patient.id || 'NEW_PATIENT',
        resource_type: 'FHIR_PATIENT',
        outcome: 'success',
        details: { patient_name: patient.name?.[0]?.family }
    });
    res.status(201).json({ status: 'Created', id: patient.id });
});
app.listen(PORT, () => {
    shared_1.logger.info(`Gateway running on port ${PORT}`);
    shared_1.logger.info('Ingestion FHIR active sur /api/fhir/Patient');
});
