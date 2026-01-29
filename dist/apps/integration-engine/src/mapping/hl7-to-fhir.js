"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapHl7ToFhirPatient = mapHl7ToFhirPatient;
const patient_validator_1 = require("../validation/patient-validator");
function mapHl7ToFhirPatient(hl7Message) {
    // Simple parser for PID segment (MVP)
    const segments = hl7Message.split('\r');
    const pid = segments.find(s => s.startsWith('PID'));
    if (!pid) {
        throw new Error('PID segment not found in HL7 message');
    }
    const fields = pid.split('|');
    // PID-3 Mapping (Patient Identifier List)
    const patientIds = fields[3].split('~');
    const identifiers = patientIds.map(idStr => {
        const components = idStr.split('^');
        const value = components[0];
        const type = components[3]; // PID-3.4 (Assigning Authority)
        // Check if it's INS based on the authority (OID or label)
        const isIns = type === 'INS' || type === '1.2.250.1.213.1.4.5';
        return {
            system: isIns ? patient_validator_1.INS_OID : `https://plincare.io/id/local`,
            value: value,
            ...(isIns && { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'INS-NIR' }] } })
        };
    });
    // PID-5 Mapping (Patient Name)
    const nameComp = fields[5].split('^');
    const familyName = nameComp[0];
    const givenName = nameComp[1];
    // Extension FrPatientIdentStatus (Statut de Confiance)
    // If INS is present, we assume VALIDATED for this example (to be refined with field PID-3.6/3.7)
    const hasIns = identifiers.some(i => i.system === patient_validator_1.INS_OID);
    const extensions = [];
    if (hasIns) {
        extensions.push({
            url: 'http://interopsante.org/fhir/StructureDefinition/FrPatientIdentStatus',
            valueCode: 'VALIDATED'
        });
    }
    return {
        resourceType: 'Patient',
        identifier: identifiers,
        name: [
            {
                use: 'official',
                family: familyName.toUpperCase(), // SÉGUR: Nom de naissance en MAJUSCULES
                given: [givenName]
            }
        ],
        gender: mapGender(fields[8]),
        birthDate: formatDate(fields[7]),
        extension: extensions
    };
}
function mapGender(hl7Gender) {
    switch (hl7Gender) {
        case 'M': return 'male';
        case 'F': return 'female';
        default: return 'other';
    }
}
function formatDate(hl7Date) {
    if (!hl7Date || hl7Date.length < 8)
        return '';
    return `${hl7Date.substring(0, 4)}-${hl7Date.substring(4, 6)}-${hl7Date.substring(6, 8)}`;
}
