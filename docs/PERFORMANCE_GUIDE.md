# Performance Guide - Agent 2

Ce guide détaille les stratégies d'optimisation pour les requêtes critiques de la plateforme PFI.

## 1. Requête "Patient Cockpit"
**Objectif** : Récupérer les 5 dernières observations et le prochain rendez-vous d'un patient en une latence minimale.

### Requête Optimisée (SQL)
Grâce aux index `idx_observation_patient_date` et `idx_appointment_patient_next`, nous utilisons des scans d'index directionnels très rapides.

```sql
-- 5 dernières Observations
SELECT resource_json 
FROM observations 
WHERE patient_id = 'PATIENT_ID' 
ORDER BY (resource_json->>'effectiveDateTime')::timestamp DESC 
LIMIT 5;

-- Prochain Rendez-vous
SELECT resource_json 
FROM appointments 
WHERE patient_id = 'PATIENT_ID' 
  AND start_time > NOW() 
  AND status NOT IN ('cancelled', 'entered-in-error')
ORDER BY start_time ASC 
LIMIT 1;
```

## 2. Index Implémentés
- **Observations** : Index composé `(patient_id, effectiveDateTime DESC)`.
- **Appointments** : Index partiel `(patient_id, start_time ASC)` excluant les rendez-vous annulés.
- **Slots** : Index sur `start_time` pour la recherche de disponibilités.

## 3. Recommandations Ségur
- **Audit Logs** : La table `audit_logs` doit être partitionnée par mois si le volume dépasse 10 millions de lignes/mois pour maintenir les performances d'insertion.
- **JSONB** : Toujours utiliser l'opérateur `@>` pour les recherches dans le JSON afin de bénéficier de l'index GIN.
