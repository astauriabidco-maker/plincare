import { mapHl7ToFhirORU } from './apps/integration-engine/src/mapping/hl7-to-fhir';
const pdfHl7 = "MSH|^~\\&|LAB|FACILITY|PFI|RECEIVER|202310271030||ORU^R01|103|P|2.5\rOBR|1|REQ124|RPT457|11502-2^Laboratory report^LN|||202310271030\rOBX|1|ED|PDF^Rapport PDF^L|1|^application^pdf^base64^JVBERi0xLjQKJ...||||||F";
const resources = mapHl7ToFhirORU(pdfHl7);
const docRef = resources.find((res: any) => res.resourceType === 'DocumentReference');
const report = resources.find((res: any) => res.resourceType === 'DiagnosticReport');

console.log("DocumentReference found:", !!docRef);
if (docRef) {
    console.log("ContentType:", docRef.content[0].attachment.contentType);
    console.log("Title:", docRef.content[0].attachment.title);
}
console.log("DiagnosticReport presentedForm length:", report.presentedForm?.length || 0);
