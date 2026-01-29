/**
 * CDA R2 N1 Templates - CI-SIS Conformes
 * OIDs officiels ANS pour certification Ségur
 */

// =============================================================================
// OIDs Officiels ANS
// =============================================================================

export const CDA_OIDS = {
    // Identifiants Patients
    INS: '1.2.250.1.213.1.4.5',          // Matricule INS (NIR qualifié)
    INS_NIR: '1.2.250.1.213.1.4.8',      // NIR de production
    IPP: '1.2.250.1.213.1.4.2',          // Identifiant Patient Permanent

    // Identifiants Professionnels
    RPPS: '1.2.250.1.71.4.2.1',          // Répertoire Partagé des Professionnels de Santé
    ADELI: '1.2.250.1.71.4.2.2',         // ADELI

    // Identifiants Établissements
    FINESS: '1.2.250.1.71.4.2.2',        // FINESS Établissement
    SIRET: '1.2.250.1.71.4.2.3',         // SIRET

    // Templates CI-SIS
    CI_SIS_CDA: '1.2.250.1.213.1.1.1.1', // Template racine CI-SIS

    // HL7
    HL7_CDA_TYPE: '2.16.840.1.113883.1.3',
    LOINC: '2.16.840.1.113883.6.1',
    CONFIDENTIALITY: '2.16.840.1.113883.5.25'
} as const;

// =============================================================================
// Codes Documents LOINC
// =============================================================================

export const CDA_DOCUMENT_CODES = {
    CR_BIO: {
        code: '11502-2',
        displayName: 'Compte-rendu de biologie médicale',
        codeSystem: CDA_OIDS.LOINC
    },
    CR_IMAG: {
        code: '18748-4',
        displayName: "Compte-rendu d'imagerie médicale",
        codeSystem: CDA_OIDS.LOINC
    },
    CR_CONSULT: {
        code: '11488-4',
        displayName: 'Note de consultation',
        codeSystem: CDA_OIDS.LOINC
    }
} as const;

// =============================================================================
// XML Header Template
// =============================================================================

export function buildCdaHeader(params: {
    documentId: string;
    documentCode: typeof CDA_DOCUMENT_CODES[keyof typeof CDA_DOCUMENT_CODES];
    title: string;
    effectiveTime: string;
    patient: {
        insValue: string;
        familyName: string;
        givenName: string;
        birthDate: string; // YYYYMMDD
        gender?: 'M' | 'F' | 'UN';
    };
    author: {
        rppsId: string;
        familyName?: string;
        givenName?: string;
        time: string;
    };
    custodian: {
        finessId: string;
        name: string;
    };
}): string {
    const { documentId, documentCode, title, effectiveTime, patient, author, custodian } = params;

    return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <!-- === EN-TÊTE CDA R2 === -->
  <typeId root="${CDA_OIDS.HL7_CDA_TYPE}" extension="POCD_HD000040"/>
  <templateId root="${CDA_OIDS.CI_SIS_CDA}"/>
  <id root="${documentId}"/>
  <code code="${documentCode.code}" codeSystem="${documentCode.codeSystem}" displayName="${documentCode.displayName}"/>
  <title>${escapeXml(title)}</title>
  <effectiveTime value="${effectiveTime}"/>
  <confidentialityCode code="N" codeSystem="${CDA_OIDS.CONFIDENTIALITY}" displayName="Normal"/>
  <languageCode code="fr-FR"/>
  
  <!-- recordTarget : Patient avec INS Qualifié -->
  <recordTarget>
    <patientRole>
      <id root="${CDA_OIDS.INS}" extension="${patient.insValue}"/>
      <patient>
        <name>
          <family>${escapeXml(patient.familyName)}</family>
          <given>${escapeXml(patient.givenName)}</given>
        </name>
        <administrativeGenderCode code="${patient.gender || 'UN'}" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="${patient.birthDate}"/>
      </patient>
    </patientRole>
  </recordTarget>
  
  <!-- author : Professionnel de Santé avec RPPS -->
  <author>
    <time value="${author.time}"/>
    <assignedAuthor>
      <id root="${CDA_OIDS.RPPS}" extension="${author.rppsId}"/>
      ${author.familyName ? `<assignedPerson><name><family>${escapeXml(author.familyName)}</family><given>${escapeXml(author.givenName || '')}</given></name></assignedPerson>` : ''}
    </assignedAuthor>
  </author>
  
  <!-- custodian : Établissement avec FINESS -->
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="${CDA_OIDS.FINESS}" extension="${custodian.finessId}"/>
        <name>${escapeXml(custodian.name)}</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>`;
}

// =============================================================================
// XML Body Templates
// =============================================================================

/**
 * Corps CDA Niveau 1 : PDF intégré en Base64
 */
export function buildCdaBodyN1(pdfBase64: string): string {
    return `
  <!-- === CORPS CDA N1 (PDF Intégré) === -->
  <component>
    <nonXMLBody>
      <text mediaType="application/pdf" representation="B64">${pdfBase64}</text>
    </nonXMLBody>
  </component>
</ClinicalDocument>`;
}

/**
 * Corps CDA Niveau 3 : Résultats structurés
 */
export function buildCdaBodyN3(observations: Array<{
    code: string;
    codeSystem: string;
    displayName: string;
    value: string;
    unit: string;
    effectiveTime: string;
    referenceRange?: { low?: string; high?: string };
}>): string {
    const observationEntries = observations.map((obs, index) => `
      <entry>
        <observation classCode="OBS" moodCode="EVN">
          <code code="${obs.code}" codeSystem="${obs.codeSystem}" displayName="${escapeXml(obs.displayName)}"/>
          <effectiveTime value="${obs.effectiveTime}"/>
          <value xsi:type="PQ" value="${obs.value}" unit="${obs.unit}"/>
          ${obs.referenceRange ? `
          <referenceRange>
            <observationRange>
              ${obs.referenceRange.low ? `<low value="${obs.referenceRange.low}" unit="${obs.unit}"/>` : ''}
              ${obs.referenceRange.high ? `<high value="${obs.referenceRange.high}" unit="${obs.unit}"/>` : ''}
            </observationRange>
          </referenceRange>` : ''}
        </observation>
      </entry>`).join('\n');

    return `
  <!-- === CORPS CDA N3 (Structuré) === -->
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="30954-2" codeSystem="${CDA_OIDS.LOINC}" displayName="Relevant diagnostic tests/laboratory data Narrative"/>
          <title>Résultats de biologie</title>
          <text>Voir détails ci-dessous</text>
          ${observationEntries}
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
}

// =============================================================================
// Utility Functions
// =============================================================================

function escapeXml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function formatDateToCda(isoDate: string | Date): string {
    const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
    return date.toISOString().replace(/[-:T]/g, '').substring(0, 14);
}

export function formatDateOnlyToCda(isoDate: string): string {
    return isoDate.replace(/-/g, '').substring(0, 8);
}
