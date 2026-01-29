import { logger } from '@plincare/shared';

export const INS_OID = 'urn:oid:1.2.250.1.213.1.4.5';

export function validatePatient(resource: any) {
    if (resource.resourceType !== 'Patient') {
        throw new Error('Invalid resource type: Expected Patient');
    }

    // 1. Check for official name
    const officialName = resource.name?.find((n: any) => n.use === 'official');
    if (!officialName || !officialName.family) {
        logger.error('Compliance Error: Missing mandatory official family name');
        return { valid: false, error: 'Missing official family name' };
    }

    // 2. Check for INS identifier with correct OID
    const insIdentifier = resource.identifier?.find((i: any) => i.system === INS_OID);
    if (!insIdentifier || !insIdentifier.value) {
        logger.error('Compliance Error: Missing mandatory INS identifier (OID: 1.2.250.1.213.1.4.5)');
        return { valid: false, error: 'Missing INS identifier' };
    }

    // 3. Verify name is uppercase (Ségur requirement for official name)
    if (officialName.family !== officialName.family.toUpperCase()) {
        logger.error('Compliance Error: Official family name must be in UPPERCASE');
        return { valid: false, error: 'Official family name not in uppercase' };
    }

    return { valid: true };
}
