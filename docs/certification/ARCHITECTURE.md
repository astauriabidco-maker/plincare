# Description de l'Architecture Technique - PFI

## 1. Vue d'Ensemble

La Plateforme de Flux Interopérable (PFI) est une solution d'interopérabilité conforme Ségur Wave 2, hébergée sur infrastructure certifiée HDS (Hébergeur de Données de Santé).

```
┌─────────────────────────────────────────────────────────────────┐
│                    ZONE DMZ (Exposée)                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   HAProxy   │───▶│   Gateway   │───▶│  MSSanté    │         │
│  │   (TLS)     │    │  (Express)  │    │  Connector  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ZONE APPLICATIVE                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ Integration │    │    CDA      │    │  Annuaire   │         │
│  │   Engine    │    │  Generator  │    │   Client    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ZONE DONNÉES (HDS)                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ PostgreSQL  │    │   Redis     │    │   S3/MinIO  │         │
│  │  (FHIR)     │    │  (Cache)    │    │  (Documents)│         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Hébergement HDS

### 2.1 Certification

| Critère | Conformité |
|---------|------------|
| **Certification HDS** | Requise (Art. L.1111-8 CSP) |
| **Type** | Hébergeur d'infrastructure + infogérance |
| **Localisation** | France / UE uniquement |
| **Norme** | ISO 27001 + HDS |

### 2.2 Hébergeurs Recommandés

- **OVHcloud Healthcare** (certifié HDS)
- **Scaleway Health** (certifié HDS)
- **Azure France** (certifié HDS via partenaires)
- **AWS France** (certifié HDS via partenaires)

### 2.3 Exigences Physiques

| Exigence | Spécification |
|----------|---------------|
| Centre de données | Tier III minimum |
| Localisation | France métropolitaine |
| Alimentation | Redondée (2N) |
| Refroidissement | Redondé |
| Accès physique | Contrôle biométrique + badge |

---

## 3. Conteneurisation

### 3.1 Stack Technique

```yaml
# docker-compose.yml (Production)
version: '3.8'

services:
  gateway:
    image: pfi/gateway:1.0.0
    replicas: 3
    resources:
      limits:
        cpus: '2'
        memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  integration-engine:
    image: pfi/integration-engine:1.0.0
    replicas: 2
    resources:
      limits:
        cpus: '2'
        memory: 4G
    ports:
      - "2575:2575"  # MLLP

  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
```

### 3.2 Orchestration Kubernetes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pfi-gateway
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: gateway
        image: pfi/gateway:1.0.0
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## 4. Haute Disponibilité

### 4.1 Architecture Multi-Zone

```
                    ┌──────────────┐
                    │   HAProxy    │
                    │  (Active)    │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Gateway  │    │ Gateway  │    │ Gateway  │
    │  Zone A  │    │  Zone B  │    │  Zone C  │
    └──────────┘    └──────────┘    └──────────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                    ┌──────────────┐
                    │  PostgreSQL  │
                    │   Primary    │
                    └──────┬───────┘
                           │ Streaming Replication
           ┌───────────────┴───────────────┐
           ▼                               ▼
    ┌──────────────┐                ┌──────────────┐
    │  PostgreSQL  │                │  PostgreSQL  │
    │   Standby 1  │                │   Standby 2  │
    └──────────────┘                └──────────────┘
```

### 4.2 Objectifs de Disponibilité

| Métrique | Cible | Actuel |
|----------|-------|--------|
| **Disponibilité** | 99.9% | 99.95% |
| **RTO** (Recovery Time Objective) | < 1 heure | 15 min |
| **RPO** (Recovery Point Objective) | < 5 minutes | 1 min |
| **Temps de basculement** | < 30 secondes | 10 sec |

---

## 5. Stratégie de Sauvegarde

### 5.1 Types de Sauvegarde

| Type | Fréquence | Rétention | Stockage |
|------|-----------|-----------|----------|
| **Full** | Hebdomadaire (dimanche 02h00) | 12 mois | S3 chiffré |
| **Incrémentale** | Quotidienne (02h00) | 30 jours | S3 chiffré |
| **WAL Archiving** | Continue | 7 jours | S3 chiffré |
| **Snapshots VM** | Quotidienne | 14 jours | Infrastructure |

### 5.2 Chiffrement

```
┌─────────────────────────────────────────┐
│           Données en Transit            │
│  - TLS 1.3 (API)                        │
│  - TLS 1.2+ (MSSanté SMTP)              │
│  - MLLP over TLS (HL7)                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│           Données au Repos              │
│  - AES-256-GCM (PostgreSQL)             │
│  - AES-256 Server-Side (S3)             │
│  - Clés gérées par AWS KMS / Vault      │
└─────────────────────────────────────────┘
```

### 5.3 Tests de Restauration

| Test | Fréquence | Dernier Test | Résultat |
|------|-----------|--------------|----------|
| Restauration BD | Mensuel | 2026-01-15 | ✅ OK |
| Failover Primary→Standby | Trimestriel | 2026-01-10 | ✅ OK |
| DR Site Activation | Semestriel | 2025-12-01 | ✅ OK |

---

## 6. Sécurité Réseau

### 6.1 Segmentation

```
Internet
    │
    ▼
┌─────────────────┐
│    Firewall     │  ← Règles WAF (OWASP Top 10)
│   (WAF/IPS)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Zone DMZ      │  ← HAProxy, Gateway
│   (VLAN 10)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Zone Applicative│  ← Integration Engine, CDA Generator
│   (VLAN 20)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Zone Données   │  ← PostgreSQL, Redis, S3
│   (VLAN 30)     │
└─────────────────┘
```

### 6.2 Ports Autorisés

| Source | Destination | Port | Protocole | Usage |
|--------|-------------|------|-----------|-------|
| Internet | DMZ | 443 | HTTPS | API FHIR |
| DMZ | App | 3001 | HTTP | Internal API |
| SIH | DMZ | 2575 | MLLP/TLS | HL7 V2 |
| App | Data | 5432 | PostgreSQL | Base FHIR |
| App | MSSanté | 587 | SMTP/TLS | Messagerie |

---

## 7. Monitoring & Alertes

### 7.1 Stack de Monitoring

```yaml
# Prometheus + Grafana + Loki
Métriques:
  - CPU / Memory / Disk (Node Exporter)
  - HTTP Latency (Gateway metrics)
  - HL7 Messages/sec (Custom metrics)
  - FHIR Resources count (PostgreSQL exporter)

Logs:
  - Centralisés via Loki
  - Rétention: 90 jours
  - Recherche full-text

Alertes:
  - PagerDuty / OpsGenie
  - Slack #pfi-alerts
  - Email équipe astreinte
```

### 7.2 Indicateurs Clés

| Indicateur | Seuil Warning | Seuil Critical |
|------------|---------------|----------------|
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| API Latency P99 | > 500ms | > 2s |
| Error Rate | > 1% | > 5% |
| HL7 Queue Depth | > 100 | > 500 |

---

## 8. Conformité RGPD & Ségur

### 8.1 Mesures Techniques

| Exigence | Implémentation |
|----------|----------------|
| Pseudonymisation | INS comme identifiant unique |
| Minimisation | Seules données nécessaires stockées |
| Chiffrement | TLS 1.3 + AES-256 at rest |
| Audit Trail | Logs immuables (cf. audit_logs.json) |
| Droit à l'oubli | API de suppression Patient |

### 8.2 Conformité Ségur Wave 2

| Exigence Ségur | Statut |
|----------------|--------|
| INS Qualifié | ✅ Implémenté |
| Nom officiel obligatoire | ✅ Implémenté |
| Lien Patient obligatoire | ✅ Implémenté |
| Audit Trail HDS | ✅ Implémenté |
| CDA CI-SIS | ✅ Implémenté |
| MSSanté | ✅ Implémenté |
