/**
 * Tests CDA R2 N1 Generator - CR-BIO
 * Vérifie conformité ANS CI-SIS
 */

import { generateCrBio, createDocumentReferenceFhir } from './cda-generator';
import { validateCdaStructure, quickValidateCriticalElements } from './cda-validator';
import { CDA_OIDS } from './cda-templates';

describe('CDA CR-BIO Generator', () => {
    // Données de test
    const mockPatient = {
        id: 'pat-123456789012345',
        identifier: [
            {
                system: 'urn:oid:1.2.250.1.213.1.4.5',
                value: '123456789012345'
            }
        ],
        name: [{
            family: 'DUPONT',
            given: ['JEAN', 'PIERRE'],
            use: 'official'
        }],
        birthDate: '1985-06-15',
        gender: 'male' as const
    };

    const mockObservations = [
        {
            id: 'obs-glucose-1',
            code: {
                coding: [{
                    system: 'http://loinc.org',
                    code: '2339-0',
                    display: 'Glucose [Mass/volume] in Blood'
                }]
            },
            valueQuantity: {
                value: 5.2,
                unit: 'mmol/L',
                system: 'http://unitsofmeasure.org',
                code: 'mmol/L'
            },
            effectiveDateTime: '2026-01-29T08:00:00Z',
            referenceRange: [{
                low: { value: 3.9, unit: 'mmol/L' },
                high: { value: 6.1, unit: 'mmol/L' }
            }]
        }
    ];

    const mockDiagnosticReport = {
        id: 'dr-lab-001',
        status: 'final',
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: '11502-2',
                display: 'Laboratory report'
            }]
        },
        subject: { reference: 'Patient/pat-123456789012345' },
        issued: '2026-01-29T10:00:00Z',
        result: [{ reference: 'Observation/obs-glucose-1' }],
        presentedForm: [{
            contentType: 'application/pdf',
            data: 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoK'
        }]
    };

    const cdaOptions = {
        author: {
            rppsId: '10101234567',
            familyName: 'MARTIN',
            givenName: 'Sophie'
        },
        custodian: {
            finessId: '750712184',
            name: 'Laboratoire Central Paris'
        }
    };

    describe('generateCrBio', () => {
        it('should generate valid CDA XML with all required sections', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

            // Vérification structure de base
            expect(cda).toContain('<?xml version="1.0"');
            expect(cda).toContain('<ClinicalDocument');
            expect(cda).toContain('</ClinicalDocument>');
        });

        it('should include recordTarget with INS OID', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

            expect(cda).toContain('<recordTarget>');
            expect(cda).toContain(`root="${CDA_OIDS.INS}"`);
            expect(cda).toContain('extension="123456789012345"');
        });

        it('should include author with RPPS OID', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

            expect(cda).toContain('<author>');
            expect(cda).toContain(`root="${CDA_OIDS.RPPS}"`);
            expect(cda).toContain('extension="10101234567"');
        });

        it('should include custodian with FINESS OID', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

            expect(cda).toContain('<custodian>');
            expect(cda).toContain(`root="${CDA_OIDS.FINESS}"`);
            expect(cda).toContain('extension="750712184"');
        });

        it('should include patient demographic data', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

            expect(cda).toContain('<family>DUPONT</family>');
            expect(cda).toContain('<given>JEAN PIERRE</given>');
            expect(cda).toContain('value="19850615"'); // birthDate
        });

        it('should include N1 body with PDF when useStructuredBody is false', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);

            expect(cda).toContain('<nonXMLBody>');
            expect(cda).toContain('mediaType="application/pdf"');
            expect(cda).toContain('representation="B64"');
        });

        it('should include N3 body with observations when useStructuredBody is true', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, {
                ...cdaOptions,
                useStructuredBody: true
            });

            expect(cda).toContain('<structuredBody>');
            expect(cda).toContain('code="2339-0"'); // LOINC glucose
            expect(cda).toContain('value="5.2"');
            expect(cda).toContain('unit="mmol/L"');
        });

        it('should throw error if INS is missing', () => {
            const patientWithoutIns = { ...mockPatient, identifier: [] };

            expect(() => {
                generateCrBio(patientWithoutIns, mockDiagnosticReport, mockObservations, cdaOptions);
            }).toThrow('INS Qualifié manquant');
        });

        it('should throw error if official name is missing', () => {
            const patientWithoutName = { ...mockPatient, name: [] };

            expect(() => {
                generateCrBio(patientWithoutName, mockDiagnosticReport, mockObservations, cdaOptions);
            }).toThrow('Nom officiel manquant');
        });
    });

    describe('validateCdaStructure', () => {
        it('should validate a correctly generated CDA', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);
            const result = validateCdaStructure(cda);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing recordTarget', () => {
            const invalidCda = '<?xml version="1.0"?><ClinicalDocument><author></author></ClinicalDocument>';
            const result = validateCdaStructure(invalidCda);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.code.includes('CDA-003'))).toBe(true);
        });

        it('should detect missing INS OID', () => {
            const cdaWithoutIns = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions)
                .replace(CDA_OIDS.INS, 'WRONG_OID');
            const result = validateCdaStructure(cdaWithoutIns);

            expect(result.errors.some(e => e.message.includes('INS'))).toBe(true);
        });
    });

    describe('quickValidateCriticalElements', () => {
        it('should return true for all elements when CDA is valid', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);
            const result = quickValidateCriticalElements(cda);

            expect(result.hasRecordTarget).toBe(true);
            expect(result.hasAuthor).toBe(true);
            expect(result.hasCustodian).toBe(true);
            expect(result.allPresent).toBe(true);
        });
    });

    describe('createDocumentReferenceFhir', () => {
        it('should create valid FHIR DocumentReference linked to CDA', () => {
            const cda = generateCrBio(mockPatient, mockDiagnosticReport, mockObservations, cdaOptions);
            const docRef = createDocumentReferenceFhir(cda, mockPatient, mockDiagnosticReport) as any;

            expect(docRef.resourceType).toBe('DocumentReference');
            expect(docRef.status).toBe('current');
            expect(docRef.subject.reference).toBe('Patient/pat-123456789012345');
            expect(docRef.content[0].attachment.contentType).toBe('application/xml');
            expect(docRef.context.related[0].reference).toBe('DiagnosticReport/dr-lab-001');
        });
    });
});
