import { mapHl7ToFhirORU } from './apps/integration-engine/src/mapping/hl7-to-fhir';
const hl7 = "MSH|^~\\&|LAB|FACILITY|PFI|RECEIVER|202310271030||ORU^R01|102|P|2.5\rOBR|1|REQ123|RPT456|2339-0^Glucose^LN|||202310271030\rOBX|1|NM|GLY^Glycémie^L|1|5.5|mmol/L|3.9-6.1|N|||F\rOBX|2|ED|PDF^Rapport PDF^L|1|^application^pdf^base64^JVBERi0xLjQKJ...||||||F";
const report = mapHl7ToFhirORU(hl7);
console.log(JSON.stringify(report, null, 2));
