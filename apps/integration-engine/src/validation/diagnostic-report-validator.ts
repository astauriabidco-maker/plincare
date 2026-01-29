import { logger } from '@plincare/shared';
import { validateResourceSemantics } from './semantic-validator';

export function validateDiagnosticReport(resource: any) {
    if (resource.resourceType !== 'DiagnosticReport') {
        throw new Error('Invalid resource type: Expected DiagnosticReport');
    }

    // 1. Check for subject (Reference to Patient)
    const subject = resource.subject;
    if (!subject || !subject.reference || !subject.reference.startsWith('Patient/')) {
        logger.error('Compliance Error: DiagnosticReport is orphan (Missing or invalid subject reference)');
        return { valid: false, error: 'DiagnosticReport must be linked to a Patient' };
    }

    // 2. Extra check: ensure effectiveDateTime or effectivePeriod is present (Recommended in Ségur/FHIR)
    if (!resource.effectiveDateTime && !resource.effectivePeriod) {
        logger.warn('DiagnosticReport missing effective time (Recommended)');
    }

    // 3. Ensure status is present
    if (!resource.status) {
        logger.error('Compliance Error: Missing mandatory status in DiagnosticReport');
        return { valid: false, error: 'Missing status' };
    }

    return { valid: true };
}
