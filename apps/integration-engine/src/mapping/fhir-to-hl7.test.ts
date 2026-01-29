import { buildSchSegment, mapFhirToHl7Siu } from './fhir-to-hl7';

describe('Write-Back FHIR -> HL7 SIU', () => {
    const mockAppointment = {
        id: 'apt-12345',
        status: 'booked',
        description: 'Consultation générale',
        start: '2026-01-29T10:00:00Z',
        end: '2026-01-29T10:30:00Z',
        minutesDuration: 30,
        appointmentType: {
            coding: [{ code: 'ROUTINE', display: 'Routine' }]
        },
        serviceType: [{
            coding: [{ code: 'CON', display: 'Consultation' }]
        }]
    };

    const mockPatient = {
        id: 'pat-123456789012345',
        identifier: [
            { system: 'urn:oid:1.2.250.1.213.1.4.5', value: '123456789012345' }
        ],
        name: [{ family: 'DUBOIS', given: ['JEAN'] }],
        birthDate: '1985-05-12',
        gender: 'male'
    };

    describe('buildSchSegment', () => {
        it('should generate a valid SCH segment', () => {
            const sch = buildSchSegment(mockAppointment);

            expect(sch).toContain('SCH|apt-12345');
            expect(sch).toContain('Consultation générale');
            expect(sch).toContain('30');
            expect(sch).toContain('min^^UCUM');
            expect(sch).toContain('Booked');
        });

        it('should include timing quantity with start and end times', () => {
            const sch = buildSchSegment(mockAppointment);

            // Vérifier le format HL7 de la date (YYYYMMDDHHMMSS)
            expect(sch).toContain('20260129100000');
        });
    });

    describe('mapFhirToHl7Siu', () => {
        it('should generate a complete SIU^S12 message for create action', () => {
            const siu = mapFhirToHl7Siu(mockAppointment, mockPatient, 'create');

            expect(siu).toContain('MSH|');
            expect(siu).toContain('SIU^S12^SIU_S12');
            expect(siu).toContain('SCH|');
            expect(siu).toContain('PID|');
            expect(siu).toContain('RGS|');
            expect(siu).toContain('AIS|');
        });

        it('should generate SIU^S13 for update action', () => {
            const siu = mapFhirToHl7Siu(mockAppointment, mockPatient, 'update');

            expect(siu).toContain('SIU^S13^SIU_S12');
            expect(siu).toContain('SCH|');
            expect(siu).toContain('Confirmed'); // AIS status
        });

        it('should generate SIU^S15 for cancel action', () => {
            const siu = mapFhirToHl7Siu(mockAppointment, mockPatient, 'cancel');

            expect(siu).toContain('SIU^S15^SIU_S12');
            expect(siu).toContain('Cancelled'); // SCH status & AIS status
        });

        it('should default to S12 when no action specified', () => {
            const siu = mapFhirToHl7Siu(mockAppointment, mockPatient);

            expect(siu).toContain('SIU^S12^SIU_S12');
        });

        it('should include INS identifier in PID segment', () => {
            const siu = mapFhirToHl7Siu(mockAppointment, mockPatient);

            expect(siu).toContain('123456789012345^^^INS');
        });

        it('should include patient name in correct HL7 format', () => {
            const siu = mapFhirToHl7Siu(mockAppointment, mockPatient);

            expect(siu).toContain('DUBOIS^JEAN');
        });
    });
});
