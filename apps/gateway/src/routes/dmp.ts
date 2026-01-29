/**
 * DMP Routes - Génération de documents CDA pour Mon Espace Santé
 */

import { Router, Request, Response } from 'express';
import { logger } from '@plincare/shared';

const router = Router();

// Types pour les requêtes
interface GenerateCdaRequest {
    patientId: string;
    diagnosticReportId: string;
    observationIds?: string[];
    options?: {
        useStructuredBody?: boolean;
        authorRpps?: string;
        authorName?: string;
        custodianFiness?: string;
        custodianName?: string;
    };
}

// Configuration par défaut (à remplacer par config env en production)
const DEFAULT_CUSTODIAN = {
    finessId: process.env.DEFAULT_FINESS || '999999999',
    name: process.env.DEFAULT_ESTABLISHMENT || 'Établissement de Santé PFI'
};

const DEFAULT_AUTHOR = {
    rppsId: process.env.DEFAULT_RPPS || '10000000001',
    familyName: 'SYSTEM',
    givenName: 'PFI'
};

/**
 * POST /api/dmp/generate-cda
 * Génère un document CDA R2 N1 CR-BIO à partir de ressources FHIR
 */
router.post('/generate-cda', async (req: Request, res: Response) => {
    try {
        const body: GenerateCdaRequest = req.body;
        const { patientId, diagnosticReportId, observationIds, options } = body;

        if (!patientId || !diagnosticReportId) {
            res.status(400).json({
                error: 'Missing required fields: patientId and diagnosticReportId'
            });
            return;
        }

        logger.info('CDA generation request', { patientId, diagnosticReportId });

        // TODO: Fetch resources from PostgreSQL
        // Pour le MVP, on simule la récupération des ressources

        // Placeholder: En production, récupérer depuis la base
        const mockPatient = await fetchPatient(patientId);
        const mockDiagnosticReport = await fetchDiagnosticReport(diagnosticReportId);
        const mockObservations = observationIds
            ? await Promise.all(observationIds.map(fetchObservation))
            : [];

        if (!mockPatient) {
            res.status(404).json({ error: `Patient ${patientId} not found` });
            return;
        }

        if (!mockDiagnosticReport) {
            res.status(404).json({ error: `DiagnosticReport ${diagnosticReportId} not found` });
            return;
        }

        // Import dynamique du module CDA (évite circular deps)
        const { generateCrBio, validateCdaStructure, createDocumentReferenceFhir } =
            await import('./integration-engine-client');

        // Générer le CDA
        const cdaOptions = {
            author: {
                rppsId: options?.authorRpps || DEFAULT_AUTHOR.rppsId,
                familyName: options?.authorName?.split(' ')[0] || DEFAULT_AUTHOR.familyName,
                givenName: options?.authorName?.split(' ')[1] || DEFAULT_AUTHOR.givenName
            },
            custodian: {
                finessId: options?.custodianFiness || DEFAULT_CUSTODIAN.finessId,
                name: options?.custodianName || DEFAULT_CUSTODIAN.name
            },
            useStructuredBody: options?.useStructuredBody || false
        };

        const cdaXml = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

        // Valider le CDA généré
        const validationResult = validateCdaStructure(cdaXml);

        if (!validationResult.isValid) {
            logger.error('CDA validation failed', { errors: validationResult.errors });
            res.status(422).json({
                error: 'Generated CDA failed ANS validation',
                validationErrors: validationResult.errors
            });
            return;
        }

        // Créer le DocumentReference FHIR lié
        const documentReference = createDocumentReferenceFhir(cdaXml, mockPatient, mockDiagnosticReport);

        // TODO: Persister le DocumentReference dans PostgreSQL

        logger.info('CDA generated and validated successfully', {
            patientId,
            documentReferenceId: (documentReference as any).id
        });

        res.status(201).json({
            success: true,
            message: 'CDA CR-BIO generated successfully',
            validation: {
                isValid: true,
                warnings: validationResult.warnings
            },
            documentReference,
            cdaXml // Optionnel: retourner le XML brut
        });

    } catch (error: any) {
        logger.error('CDA generation failed', { error: error.message });
        res.status(500).json({
            error: 'CDA generation failed',
            message: error.message
        });
    }
});

/**
 * GET /api/dmp/validate-cda
 * Valide un document CDA existant contre les spécifications ANS
 */
router.post('/validate-cda', async (req: Request, res: Response) => {
    try {
        const { cdaXml } = req.body;

        if (!cdaXml) {
            res.status(400).json({ error: 'Missing cdaXml in request body' });
            return;
        }

        const { validateCdaStructure, validateAndReport } =
            await import('./integration-engine-client');

        const result = validateCdaStructure(cdaXml);
        const report = validateAndReport(cdaXml);

        res.json({
            isValid: result.isValid,
            errors: result.errors,
            warnings: result.warnings,
            report
        });

    } catch (error: any) {
        res.status(500).json({
            error: 'Validation failed',
            message: error.message
        });
    }
});

// =============================================================================
// Helper Functions (Stubs - à implémenter avec PostgreSQL)
// =============================================================================

async function fetchPatient(patientId: string): Promise<any | null> {
    // TODO: Remplacer par requête PostgreSQL
    // SELECT resource_json FROM patients WHERE resource_id = $1

    // Stub pour démonstration
    return {
        id: patientId,
        identifier: [
            { system: 'urn:oid:1.2.250.1.213.1.4.5', value: '123456789012345' }
        ],
        name: [{ family: 'DUPONT', given: ['JEAN'], use: 'official' }],
        birthDate: '1980-01-15',
        gender: 'male'
    };
}

async function fetchDiagnosticReport(reportId: string): Promise<any | null> {
    // TODO: Remplacer par requête PostgreSQL

    return {
        id: reportId,
        status: 'final',
        code: {
            coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' }]
        },
        issued: new Date().toISOString(),
        presentedForm: [{
            contentType: 'application/pdf',
            data: 'JVBERi0xLjQK' // Minimal PDF header
        }]
    };
}

async function fetchObservation(obsId: string): Promise<any> {
    // TODO: Remplacer par requête PostgreSQL

    return {
        id: obsId,
        code: {
            coding: [{ system: 'http://loinc.org', code: '2339-0', display: 'Glucose' }]
        },
        valueQuantity: { value: 5.5, unit: 'mmol/L' },
        effectiveDateTime: new Date().toISOString()
    };
}

export default router;
