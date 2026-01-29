"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hl7_to_fhir_1 = require("./hl7-to-fhir");
describe('HL7 ORU to FHIR Mapping', () => {
    const glucoseHl7 = "MSH|^~\\&|LAB|FACILITY|PFI|RECEIVER|202310271030||ORU^R01|102|P|2.5\rOBR|1|REQ123|RPT456|2339-0^Glucose^LN|||202310271030\rOBX|1|NM|GLY^Glycémie^L|1|5.5|mmol/L|3.9-6.1|N|||F";
    const pdfHl7 = "MSH|^~\\&|LAB|FACILITY|PFI|RECEIVER|202310271030||ORU^R01|103|P|2.5\rOBR|1|REQ124|RPT457|11502-2^Laboratory report^LN|||202310271030\rOBX|1|ED|PDF^Rapport PDF^L|1|^application^pdf^base64^JVBERi0xLjQKJ...||||||F";
    it('should create a DiagnosticReport with the correct metadata', () => {
        const report = (0, hl7_to_fhir_1.mapHl7ToFhirORU)(glucoseHl7);
        expect(report.resourceType).toBe('DiagnosticReport');
        expect(report.id).toBe('report-RPT456');
        expect(report.status).toBe('final');
        expect(report.effectiveDateTime).toBe('2023-10-27');
    });
    it('should map Glucose (GLY) to LOINC 2339-0 in contained Observation', () => {
        const report = (0, hl7_to_fhir_1.mapHl7ToFhirORU)(glucoseHl7);
        const observation = report.contained.find((res) => res.resourceType === 'Observation');
        expect(observation).toBeDefined();
        expect(observation.code.coding[0].code).toBe('2339-0');
        expect(observation.code.coding[0].system).toBe('http://loinc.org');
        expect(observation.valueQuantity.value).toBe(5.5);
        expect(observation.valueQuantity.unit).toBe('mmol/L');
    });
    it('should extract PDF base64 from OBX ED segment', () => {
        const report = (0, hl7_to_fhir_1.mapHl7ToFhirORU)(pdfHl7);
        const observation = report.contained.find((res) => res.resourceType === 'Observation');
        expect(observation).toBeDefined();
        expect(observation.valueAttachment).toBeDefined();
        expect(observation.valueAttachment.contentType).toBe('application/pdf');
        expect(observation.valueAttachment.data).toBe('JVBERi0xLjQKJ...');
    });
    it('should link DiagnosticReport to observations via result references', () => {
        const report = (0, hl7_to_fhir_1.mapHl7ToFhirORU)(glucoseHl7);
        expect(report.result).toHaveLength(1);
        expect(report.result[0].reference).toBe(`#${report.contained[0].id}`);
    });
});
