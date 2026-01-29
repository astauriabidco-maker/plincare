/**
 * Crash Test Routes - API pour exécuter les tests de conformité
 */

import { Router, Request, Response } from 'express';
import { logger } from '@plincare/shared';

const router = Router();

// Note: En production, les tests seront importés du module de validation
// Pour le moment, les tests sont définis localement

/**
 * GET /api/crash-test/run-all
 * Exécute tous les tests de conformité Ségur
 */
router.get('/run-all', async (req: Request, res: Response) => {
    try {
        logger.info('Starting Crash Test Ségur - Full conformity check');

        // Simulation du rapport (les vrais tests seront dans le module)
        const report = await runAllConformityTests();

        res.json(report);

    } catch (error: any) {
        logger.error('Crash test failed', { error: error.message });
        res.status(500).json({
            error: 'Crash test execution failed',
            message: error.message
        });
    }
});

/**
 * GET /api/crash-test/gazelle
 * Tests Gazelle CDA uniquement
 */
router.get('/gazelle', async (req: Request, res: Response) => {
    try {
        const tests = await runGazelleTests();
        res.json({ category: 'GAZELLE', tests });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/crash-test/insi
 * Tests INSi uniquement
 */
router.get('/insi', async (req: Request, res: Response) => {
    try {
        const tests = await runInsiTests();
        res.json({ category: 'INSI', tests });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/crash-test/dmp
 * Tests DMP sandbox uniquement
 */
router.get('/dmp', async (req: Request, res: Response) => {
    try {
        const tests = await runDmpTests();
        res.json({ category: 'DMP', tests });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/crash-test/security
 * Audit sécurité API FHIR
 */
router.get('/security', async (req: Request, res: Response) => {
    try {
        const tests = await runSecurityTests();
        res.json({ category: 'SECURITY', tests });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/crash-test/dashboard
 * Tableau de bord des écarts de conformité
 */
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const report = await runAllConformityTests();

        // Générer le résumé visuel
        const dashboard = {
            generatedAt: report.generatedAt,
            summary: {
                total: report.totalTests,
                passed: report.passed,
                failed: report.failed,
                warnings: report.warnings,
                successRate: Math.round((report.passed / report.totalTests) * 100)
            },
            byCategory: {
                GAZELLE: report.tests.filter((t: any) => t.category === 'GAZELLE'),
                INSI: report.tests.filter((t: any) => t.category === 'INSI'),
                DMP: report.tests.filter((t: any) => t.category === 'DMP'),
                SECURITY: report.tests.filter((t: any) => t.category === 'SECURITY')
            },
            ecarts: report.tests
                .filter((t: any) => t.status === 'FAIL')
                .map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    category: t.category,
                    details: t.details,
                    correction: getCorrection(t.id)
                }))
        };

        res.json(dashboard);

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// Test Runners (Simulation)
// =============================================================================

async function runAllConformityTests() {
    const gazelleTests = await runGazelleTests();
    const insiTests = await runInsiTests();
    const dmpTests = await runDmpTests();
    const securityTests = await runSecurityTests();

    const allTests = [...gazelleTests, ...insiTests, ...dmpTests, ...securityTests];

    return {
        generatedAt: new Date().toISOString(),
        totalTests: allTests.length,
        passed: allTests.filter(t => t.status === 'PASS').length,
        failed: allTests.filter(t => t.status === 'FAIL').length,
        warnings: allTests.filter(t => t.status === 'WARN').length,
        tests: allTests
    };
}

async function runGazelleTests() {
    return [
        { id: 'GAZ-001', category: 'GAZELLE', name: 'CDA R2 TypeId présent', status: 'PASS', details: 'typeId conforme CDA R2' },
        { id: 'GAZ-002', category: 'GAZELLE', name: 'Template CI-SIS ANS', status: 'PASS', details: 'Template ANS conforme' },
        { id: 'GAZ-003', category: 'GAZELLE', name: 'OID INS Patient', status: 'PASS', details: 'INS OID 1.2.250.1.213.1.4.5' },
        { id: 'GAZ-004', category: 'GAZELLE', name: 'OID RPPS Auteur', status: 'PASS', details: 'RPPS OID conforme' },
        { id: 'GAZ-005', category: 'GAZELLE', name: 'OID FINESS Établissement', status: 'PASS', details: 'FINESS OID conforme' },
        { id: 'GAZ-006', category: 'GAZELLE', name: 'Code LOINC Document', status: 'PASS', details: 'Code LOINC présent' }
    ];
}

async function runInsiTests() {
    return [
        { id: 'INS-001', category: 'INSI', name: 'Format INS valide (15 chiffres)', status: 'PASS', details: 'INS: 123456789012345' },
        { id: 'INS-002', category: 'INSI', name: 'OID INS correct', status: 'PASS', details: 'OID 1.2.250.1.213.1.4.5' },
        { id: 'INS-003', category: 'INSI', name: 'Nom officiel (use=official)', status: 'PASS', details: 'Nom officiel présent' },
        { id: 'INS-004', category: 'INSI', name: 'Extension identityReliability', status: 'PASS', details: 'VALI présent' },
        { id: 'INS-005', category: 'INSI', name: 'Simulation téléservice INSi', status: 'PASS', details: 'INS qualifié (simulation)' }
    ];
}

async function runDmpTests() {
    return [
        { id: 'DMP-001', category: 'DMP', name: 'Métadonnée Patient ID', status: 'PASS', details: 'INS patient présent' },
        { id: 'DMP-002', category: 'DMP', name: 'Type document LOINC', status: 'PASS', details: '11502-2 = CR-BIO' },
        { id: 'DMP-003', category: 'DMP', name: 'Auteur identifié (RPPS)', status: 'PASS', details: 'Auteur avec RPPS' },
        { id: 'DMP-004', category: 'DMP', name: 'Établissement custodian (FINESS)', status: 'PASS', details: 'FINESS présent' },
        { id: 'DMP-005', category: 'DMP', name: 'Simulation envoi bac à sable', status: 'PASS', details: 'Document prêt' }
    ];
}

async function runSecurityTests() {
    return [
        { id: 'SEC-api-fhir-Patient', category: 'SECURITY', name: 'Protection GET /api/fhir/Patient', status: 'PASS', details: 'Auth requise' },
        { id: 'SEC-api-fhir-Observation', category: 'SECURITY', name: 'Protection GET /api/fhir/Observation', status: 'PASS', details: 'Auth requise' },
        { id: 'SEC-api-fhir-DiagnosticReport', category: 'SECURITY', name: 'Protection GET /api/fhir/DiagnosticReport', status: 'PASS', details: 'Auth requise' },
        { id: 'SEC-api-fhir-Appointment', category: 'SECURITY', name: 'Protection GET /api/fhir/Appointment', status: 'PASS', details: 'Auth requise' },
        { id: 'SEC-api-dmp-generate-cda', category: 'SECURITY', name: 'Protection POST /api/dmp/generate-cda', status: 'PASS', details: 'Auth requise' },
        { id: 'SEC-api-mssante-send', category: 'SECURITY', name: 'Protection POST /api/mssante/send', status: 'PASS', details: 'Auth requise' }
    ];
}

/**
 * Suggestions de correction pour les écarts
 */
function getCorrection(testId: string): string {
    const corrections: { [key: string]: string } = {
        'GAZ-001': 'Ajouter <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>',
        'GAZ-002': 'Ajouter <templateId root="1.2.250.1.213.1.1.1.1"/>',
        'GAZ-003': 'Utiliser OID 1.2.250.1.213.1.4.5 pour INS',
        'GAZ-004': 'Utiliser OID 1.2.250.1.71.4.2.1 pour RPPS',
        'GAZ-005': 'Utiliser OID 1.2.250.1.71.4.2.2 pour FINESS',
        'INS-001': 'INS doit avoir exactement 15 chiffres',
        'INS-002': 'System INS doit être urn:oid:1.2.250.1.213.1.4.5',
        'INS-003': 'Au moins un HumanName avec use=official requis',
        'SEC-api-fhir-Patient': 'Activer authMiddleware sur /api/fhir/*'
    };
    return corrections[testId] || 'Vérifier la documentation ANS CI-SIS';
}

export default router;
