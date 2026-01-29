/**
 * Encounter Watcher - Déclenchement automatique Lettre de Liaison
 * Surveille les Encounter FHIR et envoie la Lettre à la clôture
 */

import { logger, auditLogger } from '@plincare/shared';
import { getMssanteClient } from './mssante-client';
import { generateCrBio } from '../cda/cda-generator';

// =============================================================================
// Types
// =============================================================================

export interface FhirEncounter {
    id: string;
    resourceType: 'Encounter';
    status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled';
    subject?: {
        reference?: string; // Patient/xxx
    };
    participant?: Array<{
        individual?: {
            reference?: string; // Practitioner/xxx
        };
    }>;
    period?: {
        start?: string;
        end?: string;
    };
    serviceType?: {
        coding?: Array<{
            code?: string;
            display?: string;
        }>;
    };
}

export interface EncounterWatcherConfig {
    enabled: boolean;
    pollingIntervalMs?: number;
    autoSendLettreDeLiaison: boolean;
}

// =============================================================================
// Encounter Event Handlers
// =============================================================================

/**
 * Appelé lorsqu'un Encounter passe au statut 'finished'
 * Déclenche l'envoi automatique de la Lettre de Liaison
 */
export async function onEncounterFinished(
    encounter: FhirEncounter,
    options?: {
        patient?: any;
        diagnosticReports?: any[];
        observations?: any[];
        practitionerMssante?: string;
    }
): Promise<{ sent: boolean; error?: string }> {

    logger.info('Encounter finished - triggering Lettre de Liaison', {
        encounterId: encounter.id,
        patientRef: encounter.subject?.reference
    });

    if (!encounter.subject?.reference) {
        logger.warn('Cannot send Lettre de Liaison: no patient reference');
        return { sent: false, error: 'Missing patient reference' };
    }

    // Extraire l'ID patient
    const patientId = encounter.subject.reference.replace('Patient/', '');

    // Obtenir les données nécessaires (stubbed pour le MVP)
    const patient = options?.patient || await fetchPatientStub(patientId);
    const diagnosticReports = options?.diagnosticReports || [];
    const observations = options?.observations || [];

    if (!patient) {
        return { sent: false, error: 'Patient not found' };
    }

    // Obtenir l'adresse MSSanté du médecin traitant
    let recipientMssante = options?.practitionerMssante;

    if (!recipientMssante) {
        // Essayer d'obtenir depuis le participant de l'Encounter
        const practitionerRef = encounter.participant?.[0]?.individual?.reference;
        if (practitionerRef) {
            // TODO: Lookup via Annuaire Santé (Agent 2)
            logger.warn('Practitioner MSSanté lookup not implemented yet, using placeholder');
            recipientMssante = 'medecin.traitant@medecin.mssante.fr';
        } else {
            recipientMssante = 'medecin.traitant@medecin.mssante.fr';
        }
    }

    try {
        // Générer le CDA Lettre de Liaison
        // Pour le MVP, on réutilise le générateur CR-BIO avec adaptations
        const cdaXml = generateLettreDeLiaisonCda(encounter, patient, diagnosticReports[0]);

        // Envoyer via MSSanté
        const client = getMssanteClient();
        const result = await client.sendLettreDeLiaison(
            recipientMssante,
            `${patient.name?.[0]?.family || 'Patient'} ${patient.name?.[0]?.given?.[0] || ''}`.trim(),
            cdaXml,
            encounter.id,
            patientId
        );

        if (result.success) {
            logger.info('Lettre de Liaison sent successfully', {
                encounterId: encounter.id,
                messageId: result.messageId
            });
            return { sent: true };
        } else {
            return { sent: false, error: result.error };
        }

    } catch (error: any) {
        logger.error('Failed to send Lettre de Liaison', {
            encounterId: encounter.id,
            error: error.message
        });
        return { sent: false, error: error.message };
    }
}

/**
 * Écoute les changements sur les Encounter (à appeler depuis le webhook)
 */
export async function handleEncounterChange(
    previousStatus: string | undefined,
    newEncounter: FhirEncounter
): Promise<void> {
    // Déclencher si le statut passe à 'finished'
    if (previousStatus !== 'finished' && newEncounter.status === 'finished') {
        logger.info('Encounter status changed to finished', {
            encounterId: newEncounter.id
        });
        await onEncounterFinished(newEncounter);
    }
}

// =============================================================================
// CDA Generation Helper
// =============================================================================

/**
 * Génère un CDA spécifique pour la Lettre de Liaison
 * (Simplifié pour MVP - utilise le format CR-BIO adapté)
 */
function generateLettreDeLiaisonCda(
    encounter: FhirEncounter,
    patient: any,
    diagnosticReport?: any
): string {
    const now = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
    const birthDate = patient.birthDate?.replace(/-/g, '') || '19000101';

    // INS extraction
    const insId = patient.identifier?.find((i: any) =>
        i.system?.includes('1.2.250.1.213.1.4.5')
    );
    const insValue = insId?.value || 'UNKNOWN';

    const familyName = patient.name?.[0]?.family || 'INCONNU';
    const givenName = patient.name?.[0]?.given?.join(' ') || '';

    // LOINC code pour Lettre de Liaison
    const LOINC_LETTRE_LIAISON = '34133-9'; // Summary of episode note

    return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="1.2.250.1.213.1.1.1.1"/>
  <id root="${generateUuid()}"/>
  <code code="${LOINC_LETTRE_LIAISON}" codeSystem="2.16.840.1.113883.6.1" displayName="Lettre de Liaison"/>
  <title>Lettre de Liaison - Séjour ${encounter.id}</title>
  <effectiveTime value="${now}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="fr-FR"/>
  
  <recordTarget>
    <patientRole>
      <id root="1.2.250.1.213.1.4.5" extension="${insValue}"/>
      <patient>
        <name>
          <family>${escapeXml(familyName)}</family>
          <given>${escapeXml(givenName)}</given>
        </name>
        <birthTime value="${birthDate}"/>
      </patient>
    </patientRole>
  </recordTarget>
  
  <author>
    <time value="${now}"/>
    <assignedAuthor>
      <id root="1.2.250.1.71.4.2.1" extension="${process.env.DEFAULT_RPPS || '10000000001'}"/>
    </assignedAuthor>
  </author>
  
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="1.2.250.1.71.4.2.2" extension="${process.env.DEFAULT_FINESS || '999999999'}"/>
        <name>${process.env.DEFAULT_ESTABLISHMENT || 'Établissement PFI'}</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  
  <componentOf>
    <encompassingEncounter>
      <id root="${encounter.id}"/>
      <effectiveTime>
        <low value="${encounter.period?.start?.replace(/[-:T]/g, '').substring(0, 14) || now}"/>
        <high value="${encounter.period?.end?.replace(/[-:T]/g, '').substring(0, 14) || now}"/>
      </effectiveTime>
    </encompassingEncounter>
  </componentOf>
  
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1" displayName="Allergies"/>
          <title>Synthèse du séjour</title>
          <text>
            <paragraph>Séjour du patient ${familyName} ${givenName}.</paragraph>
            <paragraph>Période: ${encounter.period?.start || 'N/A'} au ${encounter.period?.end || 'N/A'}</paragraph>
            <paragraph>Statut: ${encounter.status}</paragraph>
          </text>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
}

// =============================================================================
// Helper Functions
// =============================================================================

function escapeXml(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function fetchPatientStub(patientId: string): Promise<any> {
    // TODO: Remplacer par requête PostgreSQL
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

export default { onEncounterFinished, handleEncounterChange };
