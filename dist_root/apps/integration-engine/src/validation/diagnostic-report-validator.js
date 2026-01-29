"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDiagnosticReport = validateDiagnosticReport;
const shared_1 = require("@plincare/shared");
function validateDiagnosticReport(resource) {
    if (resource.resourceType !== 'DiagnosticReport') {
        throw new Error('Invalid resource type: Expected DiagnosticReport');
    }
    // 1. Check for subject (Reference to Patient)
    const subject = resource.subject;
    if (!subject || !subject.reference || !subject.reference.startsWith('Patient/')) {
        shared_1.logger.error('Compliance Error: DiagnosticReport is orphan (Missing or invalid subject reference)');
        return { valid: false, error: 'DiagnosticReport must be linked to a Patient' };
    }
    // 2. Extra check: ensure effectiveDateTime or effectivePeriod is present (Recommended in Ségur/FHIR)
    if (!resource.effectiveDateTime && !resource.effectivePeriod) {
        shared_1.logger.warn('DiagnosticReport missing effective time (Recommended)');
    }
    // 3. Ensure status is present
    if (!resource.status) {
        shared_1.logger.error('Compliance Error: Missing mandatory status in DiagnosticReport');
        return { valid: false, error: 'Missing status' };
    }
    return { valid: true };
}
