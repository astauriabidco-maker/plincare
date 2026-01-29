/**
 * CDA R2 N1 Generator - CR-BIO (Compte-Rendu de Biologie Médicale)
 * Conforme CI-SIS ANS pour alimentation Mon Espace Santé (DMP)
 */

import { logger } from '@plincare/shared';
import {
    CDA_OIDS,
    CDA_DOCUMENT_CODES,
    buildCdaHeader,
    buildCdaBodyN1,
    buildCdaBodyN3,
    formatDateToCda,
    formatDateOnlyToCda
} from './cda-templates';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Types
// =============================================================================

export interface FhirPatient {
    id: string;
    identifier?: Array<{
        system?: string;
        value?: string;
    }>;
    name?: Array<{
        family?: string;
        given?: string[];
        use?: string;
    }>;
    birthDate?: string;
    gender?: 'male' | 'female' | 'other' | 'unknown';
}

export interface FhirObservation {
    id: string;
    code?: {
        coding?: Array<{
            system?: string;
            code?: string;
            display?: string;
        }>;
    };
    valueQuantity?: {
        value?: number;
        unit?: string;
        system?: string;
        code?: string;
    };
    effectiveDateTime?: string;
    referenceRange?: Array<{
        low?: { value?: number; unit?: string };
        high?: { value?: number; unit?: string };
    }>;
}

export interface FhirDiagnosticReport {
    id: string;
    status?: string;
    code?: {
        coding?: Array<{
            system?: string;
            code?: string;
            display?: string;
        }>;
    };
    subject?: {
        reference?: string;
    };
    issued?: string;
    result?: Array<{
        reference?: string;
    }>;
    presentedForm?: Array<{
        contentType?: string;
        data?: string; // Base64
    }>;
}

export interface CdaGeneratorOptions {
    author: {
        rppsId: string;
        familyName?: string;
        givenName?: string;
    };
    custodian: {
        finessId: string;
        name: string;
    };
    useStructuredBody?: boolean; // N3 vs N1
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Génère un document CDA R2 N1 CR-BIO à partir de ressources FHIR
 */
export function generateCrBio(
    patient: FhirPatient,
    diagnosticReport: FhirDiagnosticReport,
    observations: FhirObservation[],
    options: CdaGeneratorOptions
): string {
    logger.info('Generating CDA CR-BIO', {
        patientId: patient.id,
        reportId: diagnosticReport.id,
        observationCount: observations.length
    });

    // Extraction INS depuis Patient
    const insIdentifier = patient.identifier?.find(
        id => id.system?.includes('1.2.250.1.213.1.4.5') || id.system?.includes('INS')
    );
    if (!insIdentifier?.value) {
        throw new Error('INS Qualifié manquant - Document non générable pour DMP');
    }

    // Extraction nom officiel
    const officialName = patient.name?.find(n => n.use === 'official') || patient.name?.[0];
    if (!officialName?.family) {
        throw new Error('Nom officiel manquant - Document non conforme Ségur');
    }

    // Génération ID document unique
    const documentId = uuidv4();
    const now = formatDateToCda(new Date().toISOString());

    // Construction Header
    const cdaHeader = buildCdaHeader({
        documentId,
        documentCode: CDA_DOCUMENT_CODES.CR_BIO,
        title: `Compte-rendu de biologie - ${diagnosticReport.code?.coding?.[0]?.display || 'Résultats'}`,
        effectiveTime: now,
        patient: {
            insValue: insIdentifier.value,
            familyName: officialName.family,
            givenName: officialName.given?.join(' ') || '',
            birthDate: formatDateOnlyToCda(patient.birthDate || '19000101'),
            gender: mapFhirGenderToCda(patient.gender)
        },
        author: {
            rppsId: options.author.rppsId,
            familyName: options.author.familyName,
            givenName: options.author.givenName,
            time: now
        },
        custodian: {
            finessId: options.custodian.finessId,
            name: options.custodian.name
        }
    });

    // Construction Body
    let cdaBody: string;

    if (options.useStructuredBody && observations.length > 0) {
        // Corps N3 : Observations structurées
        const cdaObservations = observations.map(obs => ({
            code: obs.code?.coding?.[0]?.code || 'UNKNOWN',
            codeSystem: CDA_OIDS.LOINC,
            displayName: obs.code?.coding?.[0]?.display || 'Observation',
            value: obs.valueQuantity?.value?.toString() || '0',
            unit: obs.valueQuantity?.unit || obs.valueQuantity?.code || '',
            effectiveTime: formatDateToCda(obs.effectiveDateTime || new Date().toISOString()),
            referenceRange: obs.referenceRange?.[0] ? {
                low: obs.referenceRange[0].low?.value?.toString(),
                high: obs.referenceRange[0].high?.value?.toString()
            } : undefined
        }));

        cdaBody = buildCdaBodyN3(cdaObservations);
    } else {
        // Corps N1 : PDF intégré
        const pdfData = diagnosticReport.presentedForm?.find(
            f => f.contentType === 'application/pdf'
        )?.data;

        if (!pdfData) {
            // Générer un placeholder si pas de PDF
            logger.warn('No PDF attached to DiagnosticReport, using placeholder');
            cdaBody = buildCdaBodyN1('UFBMQUNFSE9MREVS'); // "PLACEHOLDER" en base64
        } else {
            cdaBody = buildCdaBodyN1(pdfData);
        }
    }

    const fullDocument = cdaHeader + cdaBody;

    logger.info('CDA CR-BIO generated successfully', {
        documentId,
        patientIns: insIdentifier.value,
        authorRpps: options.author.rppsId,
        bodyType: options.useStructuredBody ? 'N3' : 'N1'
    });

    return fullDocument;
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapFhirGenderToCda(fhirGender?: string): 'M' | 'F' | 'UN' {
    switch (fhirGender) {
        case 'male': return 'M';
        case 'female': return 'F';
        default: return 'UN';
    }
}

/**
 * Crée un DocumentReference FHIR lié au CDA généré
 */
export function createDocumentReferenceFhir(
    cdaContent: string,
    patient: FhirPatient,
    diagnosticReport: FhirDiagnosticReport
): object {
    const cdaBase64 = Buffer.from(cdaContent, 'utf8').toString('base64');

    return {
        resourceType: 'DocumentReference',
        id: `docref-${Date.now()}`,
        status: 'current',
        type: {
            coding: [{
                system: 'http://loinc.org',
                code: '11502-2',
                display: 'Compte-rendu de biologie médicale'
            }]
        },
        subject: {
            reference: `Patient/${patient.id}`
        },
        date: new Date().toISOString(),
        description: 'CDA R2 N1 CR-BIO pour DMP',
        content: [{
            attachment: {
                contentType: 'application/xml',
                data: cdaBase64,
                title: 'Compte-rendu de biologie'
            },
            format: {
                system: 'urn:oid:1.2.250.1.213.1.1.1',
                code: 'urn:oid:1.2.250.1.213.1.1.1.1',
                display: 'CDA R2 N1 CI-SIS'
            }
        }],
        context: {
            related: [{
                reference: `DiagnosticReport/${diagnosticReport.id}`
            }]
        }
    };
}
