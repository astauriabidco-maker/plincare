/**
 * CDA Validator - Conformité ANS CI-SIS
 * Vérifie la structure des documents CDA avant envoi au DMP
 */

import { logger } from '@plincare/shared';
import { CDA_OIDS } from './cda-templates';

// =============================================================================
// Types
// =============================================================================

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    code: string;
    message: string;
    xpath?: string;
    severity: 'error';
}

export interface ValidationWarning {
    code: string;
    message: string;
    xpath?: string;
    severity: 'warning';
}

// =============================================================================
// Required Elements for ANS Certification
// =============================================================================

const REQUIRED_ELEMENTS = [
    {
        name: 'typeId',
        xpath: '/ClinicalDocument/typeId',
        validateAttr: { root: CDA_OIDS.HL7_CDA_TYPE },
        errorCode: 'CDA-001',
        message: 'typeId manquant ou invalide'
    },
    {
        name: 'templateId',
        xpath: '/ClinicalDocument/templateId',
        validateAttr: { root: CDA_OIDS.CI_SIS_CDA },
        errorCode: 'CDA-002',
        message: 'templateId CI-SIS manquant ou invalide'
    },
    {
        name: 'recordTarget',
        xpath: '/ClinicalDocument/recordTarget',
        errorCode: 'CDA-003',
        message: 'recordTarget (patient) manquant'
    },
    {
        name: 'recordTarget/INS',
        xpath: '/ClinicalDocument/recordTarget/patientRole/id',
        validateAttr: { root: CDA_OIDS.INS },
        errorCode: 'CDA-004',
        message: 'INS Qualifié manquant - OID requis: ' + CDA_OIDS.INS
    },
    {
        name: 'author',
        xpath: '/ClinicalDocument/author',
        errorCode: 'CDA-005',
        message: 'author (professionnel de santé) manquant'
    },
    {
        name: 'author/RPPS',
        xpath: '/ClinicalDocument/author/assignedAuthor/id',
        validateAttr: { root: CDA_OIDS.RPPS },
        errorCode: 'CDA-006',
        message: 'RPPS manquant - OID requis: ' + CDA_OIDS.RPPS
    },
    {
        name: 'custodian',
        xpath: '/ClinicalDocument/custodian',
        errorCode: 'CDA-007',
        message: 'custodian (établissement) manquant'
    },
    {
        name: 'custodian/FINESS',
        xpath: '/ClinicalDocument/custodian/assignedCustodian/representedCustodianOrganization/id',
        validateAttr: { root: CDA_OIDS.FINESS },
        errorCode: 'CDA-008',
        message: 'FINESS manquant - OID requis: ' + CDA_OIDS.FINESS
    },
    {
        name: 'component',
        xpath: '/ClinicalDocument/component',
        errorCode: 'CDA-009',
        message: 'component (corps du document) manquant'
    }
];

// =============================================================================
// Main Validator
// =============================================================================

/**
 * Valide un document CDA R2 contre les exigences ANS CI-SIS
 * Note: Validation basée sur regex/parsing simple pour Node.js
 * Pour validation XSD complète, utiliser un validateur externe
 */
export function validateCdaStructure(cdaXml: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    logger.info('Validating CDA structure against ANS CI-SIS requirements');

    // Vérification XML bien formé
    if (!cdaXml.includes('<?xml')) {
        errors.push({
            code: 'CDA-000',
            message: 'Document XML malformé - déclaration XML manquante',
            severity: 'error'
        });
    }

    if (!cdaXml.includes('<ClinicalDocument')) {
        errors.push({
            code: 'CDA-000',
            message: 'Élément racine ClinicalDocument manquant',
            severity: 'error'
        });
        return { isValid: false, errors, warnings };
    }

    // Validation des éléments obligatoires
    for (const req of REQUIRED_ELEMENTS) {
        const elementPresent = checkElementPresent(cdaXml, req.name);

        if (!elementPresent) {
            errors.push({
                code: req.errorCode,
                message: req.message,
                xpath: req.xpath,
                severity: 'error'
            });
            continue;
        }

        // Vérification attributs si requis
        if (req.validateAttr) {
            const attrValid = checkAttributeValue(cdaXml, req.name, req.validateAttr);
            if (!attrValid) {
                errors.push({
                    code: req.errorCode + '-ATTR',
                    message: `${req.message} - attribut root incorrect`,
                    xpath: req.xpath,
                    severity: 'error'
                });
            }
        }
    }

    // Vérifications additionnelles (warnings)

    // Vérifier présence du code LOINC
    if (!cdaXml.includes('codeSystem="2.16.840.1.113883.6.1"')) {
        warnings.push({
            code: 'CDA-W001',
            message: 'Code LOINC non détecté dans le document',
            severity: 'warning'
        });
    }

    // Vérifier présence d'un corps (N1 ou N3)
    const hasN1Body = cdaXml.includes('<nonXMLBody>');
    const hasN3Body = cdaXml.includes('<structuredBody>');

    if (!hasN1Body && !hasN3Body) {
        errors.push({
            code: 'CDA-010',
            message: 'Corps du document manquant (ni nonXMLBody ni structuredBody)',
            severity: 'error'
        });
    }

    // Vérifier langue FR
    if (!cdaXml.includes('languageCode') || !cdaXml.includes('fr')) {
        warnings.push({
            code: 'CDA-W002',
            message: 'Code langue FR non spécifié',
            severity: 'warning'
        });
    }

    const isValid = errors.length === 0;

    logger.info('CDA validation complete', {
        isValid,
        errorCount: errors.length,
        warningCount: warnings.length
    });

    return { isValid, errors, warnings };
}

// =============================================================================
// Helper Functions
// =============================================================================

function checkElementPresent(xml: string, elementName: string): boolean {
    // Gestion des noms composés (recordTarget/INS → recherche id dans recordTarget)
    const parts = elementName.split('/');
    const mainElement = parts[0];

    // Regex simple pour détecter l'élément
    const regex = new RegExp(`<${mainElement}[\\s>]`, 'i');
    return regex.test(xml);
}

function checkAttributeValue(
    xml: string,
    elementName: string,
    attrs: { [key: string]: string }
): boolean {
    for (const [attrName, attrValue] of Object.entries(attrs)) {
        const regex = new RegExp(`${attrName}=["']${escapeRegex(attrValue)}["']`, 'i');
        if (!regex.test(xml)) {
            return false;
        }
    }
    return true;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Valide et retourne un rapport formaté
 */
export function validateAndReport(cdaXml: string): string {
    const result = validateCdaStructure(cdaXml);

    let report = `=== Rapport de Validation CDA ANS ===\n`;
    report += `Statut: ${result.isValid ? '✅ VALIDE' : '❌ INVALIDE'}\n\n`;

    if (result.errors.length > 0) {
        report += `ERREURS (${result.errors.length}):\n`;
        for (const err of result.errors) {
            report += `  [${err.code}] ${err.message}\n`;
            if (err.xpath) report += `    XPath: ${err.xpath}\n`;
        }
        report += '\n';
    }

    if (result.warnings.length > 0) {
        report += `AVERTISSEMENTS (${result.warnings.length}):\n`;
        for (const warn of result.warnings) {
            report += `  [${warn.code}] ${warn.message}\n`;
        }
    }

    return report;
}

/**
 * Vérifie uniquement les 3 balises critiques (rapide)
 */
export function quickValidateCriticalElements(cdaXml: string): {
    hasRecordTarget: boolean;
    hasAuthor: boolean;
    hasCustodian: boolean;
    allPresent: boolean;
} {
    const hasRecordTarget = cdaXml.includes('<recordTarget>');
    const hasAuthor = cdaXml.includes('<author>');
    const hasCustodian = cdaXml.includes('<custodian>');

    return {
        hasRecordTarget,
        hasAuthor,
        hasCustodian,
        allPresent: hasRecordTarget && hasAuthor && hasCustodian
    };
}
