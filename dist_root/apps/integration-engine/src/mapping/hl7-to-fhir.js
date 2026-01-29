"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapHl7ToFhir = mapHl7ToFhir;
exports.mapHl7ToFhirPatient = mapHl7ToFhirPatient;
exports.mapHl7ToFhirORU = mapHl7ToFhirORU;
const patient_validator_1 = require("../validation/patient-validator");
function mapHl7ToFhir(hl7Message) {
    const segments = hl7Message.split('\r').filter(s => s.trim() !== '');
    const msh = segments.find(s => s.startsWith('MSH'));
    if (!msh)
        throw new Error('MSH segment not found');
    const mshFields = msh.split('|');
    const messageType = mshFields[8]; // MSH-9
    if (messageType.startsWith('ADT')) {
        return [mapHl7ToFhirPatient(hl7Message)];
    }
    else if (messageType.startsWith('ORU')) {
        return mapHl7ToFhirORU(hl7Message);
    }
    throw new Error(`Unsupported message type: ${messageType}`);
}
function mapHl7ToFhirPatient(hl7Message) {
    const segments = hl7Message.split('\r');
    const pid = segments.find(s => s.startsWith('PID'));
    if (!pid) {
        throw new Error('PID segment not found in HL7 message');
    }
    const fields = pid.split('|');
    // PID-3 Mapping (Patient Identifier List)
    const patientIds = fields[3].split('~');
    let insValue = '';
    const identifiers = patientIds.map(idStr => {
        const components = idStr.split('^');
        const value = components[0];
        const type = components[3];
        const isIns = type === 'INS' || type === '1.2.250.1.213.1.4.5';
        if (isIns)
            insValue = value;
        return {
            system: isIns ? patient_validator_1.INS_OID : `https://plincare.io/id/local`,
            value: value,
            ...(isIns && { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'INS-NIR' }] } })
        };
    });
    const nameComp = fields[5].split('^');
    const familyName = nameComp[0] || '';
    const givenName = nameComp[1] || '';
    const hasIns = !!insValue;
    const extensions = [];
    if (hasIns) {
        extensions.push({
            url: 'http://interopsante.org/fhir/StructureDefinition/FrPatientIdentStatus',
            valueCode: 'VALIDATED'
        });
    }
    return {
        resourceType: 'Patient',
        id: insValue ? `pat-${insValue}` : `pat-local-${Date.now()}`,
        identifier: identifiers,
        name: [
            {
                use: 'official',
                family: familyName.toUpperCase(),
                given: givenName.split(' ')
            }
        ],
        gender: mapGender(fields[8]),
        birthDate: formatDate(fields[7]),
        extension: extensions
    };
}
function mapHl7ToFhirORU(hl7Message) {
    const segments = hl7Message.split('\r').filter(s => s.trim() !== '');
    const patient = mapHl7ToFhirPatient(hl7Message);
    const resources = [patient];
    const obr = segments.find(s => s.startsWith('OBR'));
    if (!obr)
        return resources;
    const obrFields = obr.split('|');
    const reportId = obrFields[3] || obrFields[2];
    const reportDate = formatDate(obrFields[7]);
    const report = {
        resourceType: 'DiagnosticReport',
        id: `dr-${reportId}`,
        status: 'final',
        code: mapCodedElement(obrFields[4], 'http://loinc.org'),
        subject: { reference: `Patient/${patient.id}` },
        effectiveDateTime: reportDate,
        result: []
    };
    const obxSegments = segments.filter(s => s.startsWith('OBX'));
    obxSegments.forEach((obx, index) => {
        const fields = obx.split('|');
        const valueType = fields[2];
        const observationId = `obs-${reportId}-${index}`;
        const observation = {
            resourceType: 'Observation',
            id: observationId,
            status: mapObservationStatus(fields[11]),
            code: mapCodedElement(fields[3], 'http://loinc.org'),
            subject: { reference: `Patient/${patient.id}` },
            effectiveDateTime: reportDate
        };
        if (valueType === 'NM') {
            const unitParts = (fields[6] || '').split('^');
            observation.valueQuantity = {
                value: parseFloat(fields[5]),
                unit: unitParts[1] || unitParts[0],
                system: unitParts[2] === 'UCUM' ? 'http://unitsofmeasure.org' : undefined,
                code: unitParts[0]
            };
        }
        else if (valueType === 'ST' || valueType === 'TX') {
            observation.valueString = fields[5];
        }
        resources.push(observation);
        report.result.push({ reference: `Observation/${observationId}` });
    });
    resources.push(report);
    return resources;
}
function mapCodedElement(hl7Ce, defaultSystem) {
    if (!hl7Ce)
        return { text: 'Unknown' };
    const parts = hl7Ce.split('^');
    return {
        coding: [{
                system: parts[2] === 'LN' ? 'http://loinc.org' : defaultSystem,
                code: parts[0],
                display: parts[1]
            }]
    };
}
function mapObservationStatus(hl7Status) {
    switch (hl7Status) {
        case 'F': return 'final';
        case 'P': return 'preliminary';
        case 'C': return 'corrected';
        default: return 'unknown';
    }
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
    const ymd = `${hl7Date.substring(0, 4)}-${hl7Date.substring(4, 6)}-${hl7Date.substring(6, 8)}`;
    if (hl7Date.length >= 12) {
        return `${ymd}T${hl7Date.substring(8, 10)}:${hl7Date.substring(10, 12)}:00Z`;
    }
    return ymd;
}
