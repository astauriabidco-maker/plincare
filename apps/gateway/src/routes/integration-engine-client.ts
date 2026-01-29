/**
 * Integration Engine Client - CDA Functions
 * Permet au Gateway d'appeler les fonctions CDA via HTTP ou import direct
 */

/**
 * Génère un document CDA CR-BIO
 * En production, cela appellerait l'Integration Engine via HTTP
 * Pour simplifier, on réimplémente localement les fonctions essentielles
 */

// =============================================================================
// OIDs Officiels ANS (copié de cda-templates.ts)
// =============================================================================

const CDA_OIDS = {
    INS: '1.2.250.1.213.1.4.5',
    RPPS: '1.2.250.1.71.4.2.1',
    FINESS: '1.2.250.1.71.4.2.2',
    HL7_CDA_TYPE: '2.16.840.1.113883.1.3',
    CI_SIS_CDA: '1.2.250.1.213.1.1.1.1',
    LOINC: '2.16.840.1.113883.6.1',
    CONFIDENTIALITY: '2.16.840.1.113883.5.25'
} as const;

// =============================================================================
// Generate CDA CR-BIO
// =============================================================================

export function generateCrBio(
    patient: any,
    diagnosticReport: any,
    observations: any[],
    options: {
        author: { rppsId: string; familyName?: string; givenName?: string };
        custodian: { finessId: string; name: string };
        useStructuredBody?: boolean;
    }
): string {
    // Extract INS
    const insId = patient.identifier?.find((i: any) =>
        i.system?.includes('1.2.250.1.213.1.4.5') || i.system?.includes('INS')
    );
    if (!insId?.value) {
        throw new Error('INS Qualifié manquant - Document non générable pour DMP');
    }

    const officialName = patient.name?.find((n: any) => n.use === 'official') || patient.name?.[0];
    if (!officialName?.family) {
        throw new Error('Nom officiel manquant - Document non conforme Ségur');
    }

    const now = formatDate(new Date());
    const birthDate = patient.birthDate?.replace(/-/g, '') || '19000101';

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <typeId root="${CDA_OIDS.HL7_CDA_TYPE}" extension="POCD_HD000040"/>
  <templateId root="${CDA_OIDS.CI_SIS_CDA}"/>
  <id root="${generateUuid()}"/>
  <code code="11502-2" codeSystem="${CDA_OIDS.LOINC}" displayName="Compte-rendu de biologie médicale"/>
  <title>Compte-rendu de biologie</title>
  <effectiveTime value="${now}"/>
  <confidentialityCode code="N" codeSystem="${CDA_OIDS.CONFIDENTIALITY}" displayName="Normal"/>
  <languageCode code="fr-FR"/>
  
  <recordTarget>
    <patientRole>
      <id root="${CDA_OIDS.INS}" extension="${insId.value}"/>
      <patient>
        <name>
          <family>${escapeXml(officialName.family)}</family>
          <given>${escapeXml(officialName.given?.join(' ') || '')}</given>
        </name>
        <birthTime value="${birthDate}"/>
      </patient>
    </patientRole>
  </recordTarget>
  
  <author>
    <time value="${now}"/>
    <assignedAuthor>
      <id root="${CDA_OIDS.RPPS}" extension="${options.author.rppsId}"/>
    </assignedAuthor>
  </author>
  
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="${CDA_OIDS.FINESS}" extension="${options.custodian.finessId}"/>
        <name>${escapeXml(options.custodian.name)}</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>`;

    // Body
    let body: string;
    if (options.useStructuredBody && observations.length > 0) {
        const entries = observations.map(obs => `
      <entry>
        <observation classCode="OBS" moodCode="EVN">
          <code code="${obs.code?.coding?.[0]?.code || ''}" codeSystem="${CDA_OIDS.LOINC}" displayName="${escapeXml(obs.code?.coding?.[0]?.display || '')}"/>
          <value xsi:type="PQ" value="${obs.valueQuantity?.value || ''}" unit="${obs.valueQuantity?.unit || ''}"/>
        </observation>
      </entry>`).join('');

        body = `
  <component>
    <structuredBody>
      <component>
        <section>
          <title>Résultats</title>${entries}
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
    } else {
        const pdfData = diagnosticReport.presentedForm?.find((f: any) =>
            f.contentType === 'application/pdf'
        )?.data || 'UFBMQUNFSE9MREVS';

        body = `
  <component>
    <nonXMLBody>
      <text mediaType="application/pdf" representation="B64">${pdfData}</text>
    </nonXMLBody>
  </component>
</ClinicalDocument>`;
    }

    return header + body;
}

// =============================================================================
// Validate CDA Structure
// =============================================================================

export function validateCdaStructure(cdaXml: string): {
    isValid: boolean;
    errors: Array<{ code: string; message: string; severity: string }>;
    warnings: Array<{ code: string; message: string; severity: string }>;
} {
    const errors: Array<{ code: string; message: string; severity: string }> = [];
    const warnings: Array<{ code: string; message: string; severity: string }> = [];

    // Check required elements
    if (!cdaXml.includes('<ClinicalDocument')) {
        errors.push({ code: 'CDA-000', message: 'ClinicalDocument manquant', severity: 'error' });
    }
    if (!cdaXml.includes('<recordTarget>')) {
        errors.push({ code: 'CDA-003', message: 'recordTarget manquant', severity: 'error' });
    }
    if (!cdaXml.includes(CDA_OIDS.INS)) {
        errors.push({ code: 'CDA-004', message: 'INS OID manquant', severity: 'error' });
    }
    if (!cdaXml.includes('<author>')) {
        errors.push({ code: 'CDA-005', message: 'author manquant', severity: 'error' });
    }
    if (!cdaXml.includes(CDA_OIDS.RPPS)) {
        errors.push({ code: 'CDA-006', message: 'RPPS OID manquant', severity: 'error' });
    }
    if (!cdaXml.includes('<custodian>')) {
        errors.push({ code: 'CDA-007', message: 'custodian manquant', severity: 'error' });
    }
    if (!cdaXml.includes(CDA_OIDS.FINESS)) {
        errors.push({ code: 'CDA-008', message: 'FINESS OID manquant', severity: 'error' });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

export function validateAndReport(cdaXml: string): string {
    const result = validateCdaStructure(cdaXml);
    let report = `=== Rapport Validation CDA ===\n`;
    report += `Statut: ${result.isValid ? '✅ VALIDE' : '❌ INVALIDE'}\n`;
    if (result.errors.length > 0) {
        report += `Erreurs: ${result.errors.map(e => e.message).join(', ')}\n`;
    }
    return report;
}

// =============================================================================
// Create DocumentReference
// =============================================================================

export function createDocumentReferenceFhir(
    cdaContent: string,
    patient: any,
    diagnosticReport: any
): object {
    return {
        resourceType: 'DocumentReference',
        id: `docref-${Date.now()}`,
        status: 'current',
        type: {
            coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'CR-BIO' }]
        },
        subject: { reference: `Patient/${patient.id}` },
        date: new Date().toISOString(),
        content: [{
            attachment: {
                contentType: 'application/xml',
                data: Buffer.from(cdaContent, 'utf8').toString('base64'),
                title: 'Compte-rendu de biologie CDA'
            }
        }],
        context: {
            related: [{ reference: `DiagnosticReport/${diagnosticReport.id}` }]
        }
    };
}

// =============================================================================
// Utilities
// =============================================================================

function escapeXml(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(date: Date): string {
    return date.toISOString().replace(/[-:T]/g, '').substring(0, 14);
}

function generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
