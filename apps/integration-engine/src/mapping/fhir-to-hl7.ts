/**
 * Moteur de Rétro-traduction (Write-Back) : FHIR Appointment -> HL7 SIU^S12
 * Conforme au standard HL7 V2.5 - Chapitre 10 (Scheduling)
 */

const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);

/**
 * Convertit un FHIR Appointment en segment HL7 SCH (Schedule Activity Information)
 * Référence: HL7 V2.5 - Section 10.5.2
 * 
 * Structure SCH:
 * SCH-1: Placer Appointment ID
 * SCH-2: Filler Appointment ID  
 * SCH-6: Event Reason (Motif du RDV)
 * SCH-7: Appointment Reason
 * SCH-9: Appointment Duration
 * SCH-10: Appointment Duration Units
 * SCH-11: Appointment Timing Quantity (TQ1 format)
 * SCH-25: Filler Status Code (Statut du RDV)
 */
export function buildSchSegment(appointment: any): string {
    // SCH-1: Placer Appointment ID (identifiant unique)
    const placerAppId = appointment.id || `APT-${Date.now()}`;

    // SCH-2: Filler Appointment ID (ID système receveur, laissé vide pour création)
    const fillerAppId = appointment.identifier?.find((i: any) => i.type?.coding?.[0]?.code === 'FILL')?.value || '';

    // SCH-6: Event Reason (raison de l'événement de scheduling)
    const eventReason = mapAppointmentTypeToEventReason(appointment.appointmentType);

    // SCH-7: Appointment Reason (motif clinique)
    const appointmentReason = appointment.reasonCode?.[0]?.coding?.[0]?.display
        || appointment.description
        || 'Consultation';

    // SCH-8: Appointment Type (codifié)
    const appointmentType = appointment.appointmentType?.coding?.[0]?.code || 'ROUTINE';

    // SCH-9: Appointment Duration
    const duration = appointment.minutesDuration || calculateDuration(appointment.start, appointment.end) || 30;

    // SCH-10: Appointment Duration Units (UCUM)
    const durationUnits = 'min^^UCUM';

    // SCH-11: Appointment Timing Quantity (format: ^^^YYYYMMDDHHMM^YYYYMMDDHHMM)
    const startHl7 = formatToHl7DateTime(appointment.start);
    const endHl7 = formatToHl7DateTime(appointment.end);
    const timing = `^^^${startHl7}^${endHl7}`;

    // SCH-25: Filler Status Code
    const status = mapFhirStatusToHl7(appointment.status);

    // Construction du segment SCH complet
    // Format: SCH|1|2|3|4|5|6|7|8|9|10|11|...|25
    const sch = [
        'SCH',
        placerAppId,           // SCH-1
        fillerAppId,           // SCH-2
        '',                     // SCH-3: Occurrence Number
        '',                     // SCH-4: Placer Group Number
        '',                     // SCH-5: Schedule ID
        eventReason,           // SCH-6
        appointmentReason,     // SCH-7
        appointmentType,       // SCH-8
        duration.toString(),   // SCH-9
        durationUnits,         // SCH-10
        timing,                // SCH-11
        '', '', '', '', '', '', '', '', '', '', '', '', // SCH-12 à SCH-24 (vides)
        status                 // SCH-25
    ].join('|');

    return sch;
}

/**
 * Type d'action pour le Write-Back SIU
 */
export type SiuAction = 'create' | 'update' | 'cancel';

/**
 * Mappe l'action vers le type d'événement SIU correspondant
 * - S12: New appointment (création)
 * - S13: Request appointment rescheduling (modification)
 * - S15: Cancel appointment (annulation)
 */
function getSiuEventType(action: SiuAction): string {
    const eventMap: { [key in SiuAction]: string } = {
        'create': 'SIU^S12^SIU_S12',
        'update': 'SIU^S13^SIU_S12',
        'cancel': 'SIU^S15^SIU_S12'
    };
    return eventMap[action];
}

/**
 * Génère un message HL7 SIU complet à partir d'un FHIR Appointment
 * @param appointment - Ressource FHIR Appointment
 * @param patient - Ressource FHIR Patient
 * @param action - Type d'action: 'create' (S12), 'update' (S13), ou 'cancel' (S15)
 */
export function mapFhirToHl7Siu(appointment: any, patient: any, action: SiuAction = 'create'): string {
    const timestamp = formatToHl7DateTime(new Date().toISOString());
    const messageId = `MSG-${Date.now()}`;
    const eventType = getSiuEventType(action);

    // MSH - Message Header (avec type d'événement dynamique)
    const msh = `MSH|^~\\&|PFI|FACILITY|HIS|RECEIVER|${timestamp}||${eventType}|${messageId}|P|2.5|||AL|NE||8859/1`;

    // SCH - Schedule Activity Information
    // Pour les annulations, on force le statut à 'cancelled'
    const appointmentForSch = action === 'cancel'
        ? { ...appointment, status: 'cancelled' }
        : appointment;
    const sch = buildSchSegment(appointmentForSch);

    // TQ1 - Timing/Quantity (optionnel mais recommandé)
    const startHl7 = formatToHl7DateTime(appointment.start);
    const duration = appointment.minutesDuration || 30;
    const tq1 = `TQ1|1||${duration}^min^^UCUM||${startHl7}`;

    // PID - Patient Identification
    const pid = buildPidSegment(patient);

    // PV1 - Patient Visit (contexte de visite)
    const pv1 = `PV1|1|O||||||||||||||||||V1`;

    // RGS - Resource Group segment
    const rgs = `RGS|1|A`;

    // AIS - Appointment Information - Service
    const serviceCode = appointment.serviceType?.[0]?.coding?.[0]?.code || 'CON';
    const serviceDisplay = appointment.serviceType?.[0]?.coding?.[0]?.display || 'Consultation';
    const aisStatus = action === 'cancel' ? 'Cancelled' : 'Confirmed';
    const ais = `AIS|1|A|${serviceCode}^${serviceDisplay}^L||${startHl7}||${duration}|min^^UCUM||${aisStatus}`;

    // AIL - Appointment Information - Location (si disponible)
    let ail = '';
    const locationRef = appointment.participant?.find((p: any) => p.actor?.reference?.startsWith('Location/'));
    if (locationRef) {
        const locationId = locationRef.actor.reference.split('/')[1];
        ail = `AIL|1|A|${locationId}^ROOM^L|||${startHl7}||${duration}|min^^UCUM`;
    }

    // AIP - Appointment Information - Personnel (si disponible)
    let aip = '';
    const practitionerRef = appointment.participant?.find((p: any) => p.actor?.reference?.startsWith('Practitioner/'));
    if (practitionerRef) {
        const practId = practitionerRef.actor.reference.split('/')[1];
        aip = `AIP|1|A|${practId}^DOCTOR^L|||${startHl7}||${duration}|min^^UCUM`;
    }

    // Assemblage du message
    const segments = [msh, sch, tq1, pid, pv1, rgs, ais];
    if (ail) segments.push(ail);
    if (aip) segments.push(aip);

    return segments.join(CR);
}

/**
 * Construit le segment PID à partir d'un FHIR Patient
 */
function buildPidSegment(patient: any): string {
    const familyName = patient.name?.[0]?.family || '';
    const givenName = patient.name?.[0]?.given?.join(' ') || '';
    const birthDate = patient.birthDate?.replace(/-/g, '') || '';
    const gender = patient.gender === 'male' ? 'M' : patient.gender === 'female' ? 'F' : 'U';
    const insId = patient.identifier?.find((i: any) => i.system?.includes('1.2.250.1.213.1.4.5'))?.value || '';
    const localId = patient.identifier?.find((i: any) => !i.system?.includes('1.2.250.1.213.1.4.5'))?.value || patient.id || '';

    return `PID|1||${insId}^^^INS~${localId}^^^LOCAL||${familyName}^${givenName}|||${birthDate}|${gender}`;
}

/**
 * Mappe le statut FHIR vers le code HL7 Filler Status
 */
function mapFhirStatusToHl7(fhirStatus: string): string {
    const statusMap: { [key: string]: string } = {
        'proposed': 'Pending',
        'pending': 'Pending',
        'booked': 'Booked',
        'arrived': 'Arrived',
        'fulfilled': 'Complete',
        'cancelled': 'Cancelled',
        'noshow': 'Noshow',
        'entered-in-error': 'Deleted',
        'checked-in': 'Arrived',
        'waitlist': 'Waitlist'
    };
    return statusMap[fhirStatus] || 'Booked';
}

/**
 * Mappe le type de rendez-vous vers la raison d'événement HL7
 */
function mapAppointmentTypeToEventReason(appointmentType: any): string {
    if (!appointmentType) return 'ROUTINE^Routine appointment^HL70276';
    const code = appointmentType.coding?.[0]?.code;
    const display = appointmentType.coding?.[0]?.display || 'Appointment';
    return `${code}^${display}^HL70276`;
}

/**
 * Formate une date ISO vers le format HL7 (YYYYMMDDHHMM)
 */
function formatToHl7DateTime(isoDate: string | undefined): string {
    if (!isoDate) return '';
    return isoDate.replace(/[-:TZ]/g, '').substring(0, 14);
}

/**
 * Calcule la durée en minutes entre deux dates ISO
 */
function calculateDuration(start: string | undefined, end: string | undefined): number {
    if (!start || !end) return 0;
    try {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    } catch {
        return 0;
    }
}

/**
 * Enveloppe un message HL7 dans le protocole MLLP
 */
export function wrapInMllp(hl7Message: string): string {
    return `${VT}${hl7Message}${FS}${CR}`;
}
