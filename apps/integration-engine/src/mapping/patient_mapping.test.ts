import { mapHl7ToFhirPatient } from './hl7-to-fhir';
import { validatePatient, INS_OID } from '../validation/patient-validator';

describe('Patient Mapping & Ségur Compliance', () => {
    const sampleHl7 = "MSH|^~\\&|SENDER|FACILITY|PFI|RECEIVER|202310271030||ADT^A01|101|P|2.5\rPID|||123456789012345^^^1.2.250.1.213.1.4.5||DOE^John||19800101|M";

    it('should map HL7 PID-3 to FHIR INS identifier with correct OID', () => {
        const patient = mapHl7ToFhirPatient(sampleHl7);
        const ins = patient.identifier.find((i: any) => i.system === INS_OID);

        expect(ins).toBeDefined();
        expect(ins.value).toBe('123456789012345');
    });

    it('should transform family name to UPPERCASE as per Ségur requirement', () => {
        const patient = mapHl7ToFhirPatient(sampleHl7);
        const officialName = patient.name.find((n: any) => n.use === 'official');

        expect(officialName.family).toBe('DOE');
    });

    it('should include FrPatientIdentStatus extension if INS is present', () => {
        const patient = mapHl7ToFhirPatient(sampleHl7);
        const statusExt = patient.extension.find((e: any) => e.url === 'http://interopsante.org/fhir/StructureDefinition/FrPatientIdentStatus');

        expect(statusExt).toBeDefined();
        expect(statusExt.valueCode).toBe('VALIDATED');
    });

    it('should pass compliance validation', () => {
        const patient = mapHl7ToFhirPatient(sampleHl7);
        const validation = validatePatient(patient);

        expect(validation.valid).toBe(true);
    });

    it('should fail validation if official name is missing or not uppercase', () => {
        const invalidPatient = {
            resourceType: 'Patient',
            identifier: [{ system: INS_OID, value: '123' }],
            name: [{ use: 'official', family: 'lowercase' }]
        };

        const validation = validatePatient(invalidPatient);
        expect(validation.valid).toBe(false);
    });
});
