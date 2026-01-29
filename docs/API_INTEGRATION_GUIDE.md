# Guide d'Intégration API FHIR - PFI

## 1. Introduction

Ce guide technique est destiné aux développeurs souhaitant intégrer leurs applications avec la Plateforme de Flux Interopérable (PFI).

### 1.1 Prérequis

- Certificat Pro Santé Connect ou Token Bearer
- Connaissance de FHIR R4
- Client HTTP (curl, Postman, SDK)

### 1.2 Environnements

| Environnement | URL | Usage |
|---------------|-----|-------|
| **Sandbox** | `https://sandbox.pfi.example.com` | Tests, développement |
| **Préproduction** | `https://preprod.pfi.example.com` | Validation |
| **Production** | `https://api.pfi.example.com` | Production |

---

## 2. Authentification

### 2.1 Obtenir un Token

```bash
# Via Pro Santé Connect (recommandé)
# 1. Rediriger vers l'autorisation PSC
# 2. Échanger le code contre un token
# 3. Utiliser le token dans les requêtes

# En-tête Authorization
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 Scopes SMART-on-FHIR

| Scope | Accès |
|-------|-------|
| `patient/Patient.read` | Lecture patients |
| `patient/Observation.read` | Lecture observations |
| `patient/Observation.write` | Création observations |
| `patient/Appointment.write` | Gestion rendez-vous |
| `system/*.*` | Accès complet (admin) |

---

## 3. Ressources Patient

### 3.1 Rechercher un Patient par INS

```bash
GET /api/fhir/Patient?identifier=urn:oid:1.2.250.1.213.1.4.5|123456789012345
Authorization: Bearer {token}
Accept: application/fhir+json
```

**Réponse :**
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 1,
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "id": "pat-123456789012345",
        "identifier": [
          {
            "system": "urn:oid:1.2.250.1.213.1.4.5",
            "value": "123456789012345"
          }
        ],
        "name": [
          {
            "use": "official",
            "family": "DUPONT",
            "given": ["JEAN"]
          }
        ],
        "birthDate": "1985-06-15",
        "gender": "male"
      }
    }
  ]
}
```

### 3.2 Créer un Patient

```bash
POST /api/fhir/Patient
Authorization: Bearer {token}
Content-Type: application/fhir+json

{
  "resourceType": "Patient",
  "identifier": [
    {
      "system": "urn:oid:1.2.250.1.213.1.4.5",
      "value": "123456789012345"
    }
  ],
  "name": [
    {
      "use": "official",
      "family": "DUPONT",
      "given": ["JEAN"]
    }
  ],
  "birthDate": "1985-06-15",
  "gender": "male"
}
```

> **⚠️ Contraintes Ségur :**
> - `identifier.system` doit être `urn:oid:1.2.250.1.213.1.4.5` (INS)
> - `name.use` doit inclure au moins un `official`

---

## 4. Ressources Observation

### 4.1 Récupérer les Observations d'un Patient

```bash
GET /api/fhir/Observation?patient=Patient/pat-123&code=2339-0
Authorization: Bearer {token}
Accept: application/fhir+json
```

### 4.2 Créer une Observation (Résultat de Biologie)

```bash
POST /api/fhir/Observation
Authorization: Bearer {token}
Content-Type: application/fhir+json

{
  "resourceType": "Observation",
  "status": "final",
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "2339-0",
        "display": "Glucose [Mass/volume] in Blood"
      }
    ]
  },
  "subject": {
    "reference": "Patient/pat-123456789012345"
  },
  "effectiveDateTime": "2026-01-29T10:30:00Z",
  "valueQuantity": {
    "value": 5.2,
    "unit": "mmol/L",
    "system": "http://unitsofmeasure.org",
    "code": "mmol/L"
  },
  "referenceRange": [
    {
      "low": { "value": 3.9, "unit": "mmol/L" },
      "high": { "value": 6.1, "unit": "mmol/L" }
    }
  ]
}
```

> **⚠️ Contraintes Ségur :**
> - `code.coding.system` doit être `http://loinc.org`
> - `valueQuantity.system` doit être `http://unitsofmeasure.org` (UCUM)

---

## 5. Rendez-vous (Scheduling)

### 5.1 Rechercher des Créneaux Disponibles

```bash
GET /api/fhir/Slot?schedule=Schedule/scanner-1&status=free&start=ge2026-02-01
Authorization: Bearer {token}
Accept: application/fhir+json
```

### 5.2 Créer un Rendez-vous

```bash
POST /api/fhir/Appointment
Authorization: Bearer {token}
Content-Type: application/fhir+json

{
  "resourceType": "Appointment",
  "status": "booked",
  "serviceType": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "394802001",
          "display": "General medicine"
        }
      ]
    }
  ],
  "start": "2026-02-01T09:00:00Z",
  "end": "2026-02-01T09:30:00Z",
  "participant": [
    {
      "actor": { "reference": "Patient/pat-123456789012345" },
      "status": "accepted"
    },
    {
      "actor": { "reference": "Practitioner/pra-10101010101" },
      "status": "accepted"
    }
  ]
}
```

> **ℹ️ Write-Back automatique :**
> La création d'un rendez-vous déclenche automatiquement l'envoi d'un message HL7 SIU^S12 vers le SIH historique.

### 5.3 Annuler un Rendez-vous

```bash
PATCH /api/fhir/Appointment/apt-001
Authorization: Bearer {token}
Content-Type: application/fhir+json

{
  "status": "cancelled"
}
```

> L'annulation déclenche un message HL7 SIU^S15.

---

## 6. Génération CDA (DMP)

### 6.1 Générer un Document CDA

```bash
POST /api/dmp/generate-cda
Authorization: Bearer {token}
Content-Type: application/json

{
  "patientId": "pat-123456789012345",
  "diagnosticReportId": "dr-001",
  "observationIds": ["obs-001", "obs-002"],
  "options": {
    "useStructuredBody": false,
    "authorRpps": "10101010101",
    "custodianFiness": "999999999",
    "custodianName": "Laboratoire Test"
  }
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "CDA generated successfully",
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": []
  },
  "documentReference": {
    "resourceType": "DocumentReference",
    "id": "docref-cda-001",
    "type": { "coding": [{ "code": "11502-2" }] },
    "content": [{ "attachment": { "contentType": "application/xml" } }]
  },
  "cdaXml": "<?xml version=\"1.0\"?>..."
}
```

### 6.2 Valider un CDA Existant

```bash
POST /api/dmp/validate-cda
Authorization: Bearer {token}
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  ...
</ClinicalDocument>
```

---

## 7. Messagerie MSSanté

### 7.1 Envoyer un Email Sécurisé

```bash
POST /api/mssante/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "recipientRpps": "20202020202",
  "subject": "Résultats de biologie",
  "body": "Veuillez trouver ci-joint les résultats...",
  "patientId": "pat-123456789012345",
  "cdaXml": "<?xml version=\"1.0\"?>..."
}
```

### 7.2 Rechercher une Adresse MSSanté

```bash
POST /api/mssante/lookup-rpps
Authorization: Bearer {token}
Content-Type: application/json

{
  "rppsId": "20202020202"
}
```

**Réponse :**
```json
{
  "found": true,
  "practitioner": {
    "rppsId": "20202020202",
    "familyName": "MARTIN",
    "givenName": "Sophie",
    "profession": "Médecin généraliste",
    "mssanteAddress": "dr.martin@medecin.mssante.fr"
  }
}
```

---

## 8. Codes d'Erreur

| Code HTTP | Signification | Action |
|-----------|---------------|--------|
| 400 | Requête invalide | Vérifier le format JSON/FHIR |
| 401 | Non authentifié | Renouveler le token |
| 403 | Accès refusé | Vérifier les scopes |
| 404 | Ressource non trouvée | Vérifier l'ID |
| 422 | Validation échouée | Vérifier contraintes Ségur |
| 500 | Erreur serveur | Contacter le support |

### Exemple d'Erreur (OperationOutcome)

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "required",
      "diagnostics": "Patient.name with use='official' is required (Ségur compliance)"
    }
  ]
}
```

---

## 9. Webhooks (FHIR Subscriptions)

### 9.1 Créer une Souscription

```bash
POST /api/fhir/Subscription
Authorization: Bearer {token}
Content-Type: application/fhir+json

{
  "resourceType": "Subscription",
  "status": "requested",
  "criteria": "Appointment?status=cancelled",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://votre-app.com/webhooks/pfi",
    "header": ["Authorization: Bearer {votre-secret}"]
  }
}
```

### 9.2 Format des Notifications

```json
{
  "resourceType": "Bundle",
  "type": "history",
  "entry": [
    {
      "resource": {
        "resourceType": "Appointment",
        "id": "apt-001",
        "status": "cancelled"
      }
    }
  ]
}
```

---

## 10. SDK et Exemples

### 10.1 JavaScript/TypeScript

```typescript
import { Client } from 'fhir-kit-client';

const client = new Client({
  baseUrl: 'https://api.pfi.example.com/api/fhir',
  customHeaders: {
    Authorization: `Bearer ${token}`
  }
});

// Rechercher un patient
const bundle = await client.search({
  resourceType: 'Patient',
  searchParams: {
    identifier: 'urn:oid:1.2.250.1.213.1.4.5|123456789012345'
  }
});

// Créer une observation
const observation = await client.create({
  resourceType: 'Observation',
  body: {
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '2339-0' }] },
    subject: { reference: 'Patient/pat-123' },
    valueQuantity: { value: 5.2, unit: 'mmol/L', system: 'http://unitsofmeasure.org' }
  }
});
```

### 10.2 Python

```python
from fhirclient import client
from fhirclient.models import patient, observation

settings = {
    'app_id': 'pfi_client',
    'api_base': 'https://api.pfi.example.com/api/fhir'
}
smart = client.FHIRClient(settings=settings)
smart.server.session.headers['Authorization'] = f'Bearer {token}'

# Rechercher un patient
search = patient.Patient.where(struct={
    'identifier': 'urn:oid:1.2.250.1.213.1.4.5|123456789012345'
})
patients = search.perform_resources(smart.server)
```

---

## 11. Support

| Canal | Contact |
|-------|---------|
| **Documentation** | https://docs.pfi.example.com |
| **Email** | support@pfi.example.com |
| **Slack** | #pfi-integrators |
| **Status** | https://status.pfi.example.com |
