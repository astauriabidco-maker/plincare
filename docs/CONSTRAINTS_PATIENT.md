# Fiche de Vérité : Ressource Patient (FHIR R4 - Profil France)

**Cible** : Certification Ségur Vague 2 / PFI Souveraine
**Standard** : HL7 FHIR R4 & Profil "Interop’Santé Patient"

## 1. Identifiants Pivot (Identifier)
Chaque ressource Patient doit obligatoirement comporter deux types d'identifiants :

- **Matricule INS (Identité Nationale de Santé)** :
  - **System** : `urn:oid:1.2.250.1.213.1.4.5`
  - **Value** : Le NIR (ou NIA) à 15 chiffres.
  - **Type** : Doit utiliser le code `INS-NIR` (issu du système de code français).

- **Identifiant Local (IPP)** :
  - **System** : URL spécifique à l'établissement (ex: `https://hopital-x.fr/identifiants/ipp`).
  - **Value** : Le numéro de dossier patient issu du DPI historique.

## 2. Traits d'Identité Stricts (Name & Birth)
Le Ségur exige une distinction nette entre l'identité de l'état civil et l'identité d'usage.

- **Nom de Naissance (Obligatoire)** :
  - **use** : `official`
  - **family** : Nom de naissance en **MAJUSCULES**.

- **Nom d'Usage (Optionnel)** :
  - **use** : `usual`
  - **family** : Nom marital ou d'usage.

- **Prénoms** :
  - **given** : Premier prénom de l'état civil en première position. Les prénoms suivants séparés par des virgules ou dans des entrées `given` multiples.

- **Lieu de Naissance (Extension Obligatoire)** :
  - Utiliser l'extension `http://hl7.org/fhir/StructureDefinition/patient-birthPlace`.
  - Doit inclure le code INSEE de la commune (si France).

## 3. Statut de Confiance (Extension INS)
C'est le critère le plus surveillé lors de la certification. Vous devez implémenter l'extension pour le Statut d'Identité.

- **URL de l'extension** : `http://interopsante.org/fhir/StructureDefinition/FrPatientIdentStatus` (ou nomenclature ANS en vigueur).
- **Valeurs autorisées** :
  - `QUALIFIED` : Identité vérifiée par une pièce d'identité ET validée via le téléservice INSi.
  - `VALIDATED` : Identité vérifiée par une pièce d'identité mais pas encore vérifiée par le service INSi.
  - `RECOVERED` : Identité récupérée via INSi mais non encore validée par pièce d'identité.

## 4. Règles de Mapping (HL7 V2 -> FHIR)
L'agent de mapping (Agent 1) doit suivre ces correspondances :

| Champ HL7 V2 (Segment PID) | Ressource FHIR Patient | Commentaire |
| :--- | :--- | :--- |
| PID-3.1 (ID) + PID-3.4 (INS) | `identifier` (INS) | Si PID-3.4 contient l'OID INS (`1.2.250.1.213.1.4.5`). |
| PID-5.1 (Family Name) | `name[use=official].family` | Toujours prioriser le nom de naissance. |
| PID-5.2 (Given Name) | `name.given` | Premier prénom. |
| PID-7 (Date of Birth) | `birthDate` | Format `YYYY-MM-DD`. |
| PID-8 (Sex) | `gender` | `M` -> `male`, `F` -> `female`, `O` -> `other`. |

---

> [!IMPORTANT]
> **Contrainte Globale** : Toute déviation par rapport à l'OID de l'INS (`1.2.250.1.213.1.4.5`) ou à la gestion du statut de confiance doit être signalée comme une erreur critique. Ce document est la source de vérité pour le développement, les schémas de base de données et les tests.
