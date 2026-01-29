"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Générateur de messages HL7 V2 pour les tests de conformité Ségur.
 */
const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);
function generateScenarioPerfect() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const msh = `MSH|^~\\&|SENDER|FACILITY|PFI|RECEIVER|${timestamp}||ADT^A01|${Math.floor(Math.random() * 10000)}|P|2.5`;
    // PID-3: 15 digits INS
    // PID-5: Birth Name in UPPERCASE, Multiple Given names
    // PID-7: Birth Date
    // PID-8: Gender
    const pid = `PID|||123456789012345^^^INS~98765^^^LOCAL||DUBOIS^JEAN PIERRE MARC||19850512|M|||123 RUE DE LA PAIX^^PARIS^^75001|||||||123456789012345`;
    return `${msh}${CR}${pid}${CR}`;
}
function generateScenarioDegraded() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const msh = `MSH|^~\\&|SENDER|FACILITY|PFI|RECEIVER|${timestamp}||ADT^A01|${Math.floor(Math.random() * 10000)}|P|2.5`;
    // PID-3: No INS, only local ID
    const pid = `PID|||98765^^^LOCAL||Martin^Paul||19900101|M`;
    return `${msh}${CR}${pid}${CR}`;
}
function generateScenarioCriticalError() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const msh = `MSH|^~\\&|SENDER|FACILITY|PFI|RECEIVER|${timestamp}||ADT^A01|${Math.floor(Math.random() * 10000)}|P|2.5`;
    // PID-3: Malformed INS (13 digits instead of 15)
    // PID-5: Empty family name
    const pid = `PID|||1234567890123^^^INS||^Thomas||19751225|F`;
    return `${msh}${CR}${pid}${CR}`;
}
function generateScenarioBiology() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const msh = `MSH|^~\\&|LABO|FACILITY|PFI|RECEIVER|${timestamp}||ORU^R01|${Math.floor(Math.random() * 10000)}|P|2.5`;
    const pid = `PID|||123456789012345^^^INS||DUBOIS^JEAN||19850512|M`;
    const obr = `OBR|1||1234^LAB|2731-1^GLUCOSE^LN|||202310271030`;
    // OBX-6: Units in UCUM
    const obx1 = `OBX|1|NM|2731-1^GLUCOSE^LN||5.5|mmol/L^mmol/L^UCUM|||N|||F`;
    const obx2 = `OBX|2|NM|2093-3^CHOLESTEROL^LN||2.1|g/L^g/L^UCUM|||N|||F`;
    return `${msh}${CR}${pid}${CR}${obr}${CR}${obx1}${CR}${obx2}${CR}`;
}
function generateScenarioRadiology() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const msh = `MSH|^~\\&|RADIO|FACILITY|PFI|RECEIVER|${timestamp}||ORU^R01|${Math.floor(Math.random() * 10000)}|P|2.5`;
    const pid = `PID|||123456789012345^^^INS||DUBOIS^JEAN||19850512|M`;
    const obr = `OBR|1||5678^RAD|72106-4^Radio Thorax^LN|||202310271100`;
    const obx = `OBX|1|TX|72106-4^Radio Thorax^LN||Pas d'anomalie pleuro-parenchymateuse décelable.||||||F`;
    return `${msh}${CR}${pid}${CR}${obr}${CR}${obx}${CR}`;
}
const scenarios = {
    perfect: generateScenarioPerfect(),
    degraded: generateScenarioDegraded(),
    critical: generateScenarioCriticalError(),
    biology: generateScenarioBiology(),
    radiology: generateScenarioRadiology()
};
const outputDir = path.join(__dirname, '../test-messages');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
Object.entries(scenarios).forEach(([name, content]) => {
    const filePath = path.join(outputDir, `${name}.hl7`);
    fs.writeFileSync(filePath, content);
    console.log(`Generated scenario '${name}' at ${filePath}`);
});
