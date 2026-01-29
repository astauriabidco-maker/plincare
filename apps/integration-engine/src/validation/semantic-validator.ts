import { logger } from '@plincare/shared';

const LOINC_SYSTEM = 'http://loinc.org';

/**
 * Valide un code sémantique (LOINC pour le Ségur)
 */
export function validateSemanticCode(coding: any): { valid: boolean; error?: string } {
    if (!coding || !coding.system || !coding.code) {
        return { valid: false, error: 'Missing system or code in coding' };
    }

    if (coding.system === LOINC_SYSTEM) {
        // Vérification du format LOINC (ex: 12345-6)
        const loincRegex = /^\d{3,7}-\d{1}$/;
        if (!loincRegex.test(coding.code)) {
            logger.error('Semantic Error: Invalid LOINC code format', { code: coding.code });
            return { valid: false, error: `Invalid LOINC code format: ${coding.code}` };
        }

        // Logue les codes critiques
        if (coding.code === '2339-0') {
            logger.info('Ségur Check: Critical LOINC code detected (Glycémie)');
        }
    }

    return { valid: true };
}

/**
 * Valide tous les codes d'une ressource (DiagnosticReport ou Observation)
 */
export function validateResourceSemantics(resource: any): { valid: boolean; error?: string } {
    // 1. Validation du code principal
    const codes = resource.code?.coding || [];
    for (const coding of codes) {
        const result = validateSemanticCode(coding);
        if (!result.valid) return result;
    }

    // 2. Si c'est un DiagnosticReport, valider les Observations contenues
    if (resource.resourceType === 'DiagnosticReport' && resource.contained) {
        for (const contained of resource.contained) {
            if (contained.resourceType === 'Observation') {
                const result = validateResourceSemantics(contained);
                if (!result.valid) return result;
            }
        }
    }

    return { valid: true };
}
