-- ============================================================================
-- Migration: Optimized Indexes for Scheduling & Patient Cockpit
-- Version: 2026-01-29-001
-- Description: Add indexes for combined Observation + Appointment queries
-- ============================================================================

-- ============================================================================
-- SECTION 1: Additional Indexes for Appointments
-- ============================================================================

-- Index composite pour recherche par statut et date
-- Optimise: GET /Appointment?status=booked&date=2026-01-29
CREATE INDEX IF NOT EXISTS idx_appointment_status_start 
ON appointments(status, start_time);

-- Index partiel pour les rendez-vous actifs (exclut cancelled/error)
-- Optimise: Requêtes "prochain RDV" sans avoir à filtrer les annulés
CREATE INDEX IF NOT EXISTS idx_appointment_active_patient_time 
ON appointments(patient_id, start_time ASC) 
WHERE status NOT IN ('cancelled', 'entered-in-error', 'noshow');

-- ============================================================================
-- SECTION 2: Additional Indexes for Slots
-- ============================================================================

-- Index composite pour recherche de créneaux libres
-- Optimise: GET /Slot?schedule=X&status=free&start=gt2026-01-29
CREATE INDEX IF NOT EXISTS idx_slot_schedule_status_time 
ON slots(schedule_id, status, start_time);

-- Index partiel pour créneaux disponibles uniquement
CREATE INDEX IF NOT EXISTS idx_slot_free 
ON slots(schedule_id, start_time) 
WHERE status = 'free';

-- ============================================================================
-- SECTION 3: Additional Indexes for Schedules
-- ============================================================================

-- Index sur l'actor (ressource/personne liée au planning)
-- Optimise: Recherche de planning par Device ou Practitioner
CREATE INDEX IF NOT EXISTS idx_schedule_actor 
ON schedules USING GIN ((resource_json->'actor'));

-- Index sur le service category
CREATE INDEX IF NOT EXISTS idx_schedule_service_category 
ON schedules USING GIN ((resource_json->'serviceCategory'));

-- ============================================================================
-- SECTION 4: Observations - Enhanced Lab Results Indexing
-- ============================================================================

-- Index composite pour type d'observation (LOINC) + patient + date
-- Optimise: "5 dernières glycémies du patient X"
CREATE INDEX IF NOT EXISTS idx_observation_patient_code_date 
ON observations(
    patient_id, 
    ((resource_json->'code'->'coding'->0->>'code')),
    ((resource_json->>'effectiveDateTime')::timestamp) DESC
);

-- Index pour catégorie (laboratory, vital-signs, etc)
CREATE INDEX IF NOT EXISTS idx_observation_category 
ON observations USING GIN ((resource_json->'category'));

-- ============================================================================
-- SECTION 5: Patient Cockpit - Optimized Combined Query View
-- ============================================================================

-- Vue matérialisée pour le "Patient Cockpit" - Données agrégées
-- Contient: Patient + 5 dernières observations + prochain RDV
-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY patient_cockpit;

CREATE MATERIALIZED VIEW IF NOT EXISTS patient_cockpit AS
WITH latest_observations AS (
    SELECT 
        patient_id,
        jsonb_agg(
            resource_json ORDER BY (resource_json->>'effectiveDateTime')::timestamp DESC
        ) FILTER (
            WHERE rn <= 5
        ) AS last_5_observations
    FROM (
        SELECT 
            patient_id,
            resource_json,
            ROW_NUMBER() OVER (
                PARTITION BY patient_id 
                ORDER BY (resource_json->>'effectiveDateTime')::timestamp DESC
            ) as rn
        FROM observations
    ) ranked
    GROUP BY patient_id
),
next_appointment AS (
    SELECT DISTINCT ON (patient_id)
        patient_id,
        resource_id AS next_appointment_id,
        resource_json AS next_appointment,
        start_time AS next_appointment_time
    FROM appointments
    WHERE status NOT IN ('cancelled', 'entered-in-error', 'noshow')
      AND start_time > NOW()
    ORDER BY patient_id, start_time ASC
)
SELECT 
    p.resource_id AS patient_id,
    p.resource_json AS patient,
    p.ins_value,
    COALESCE(lo.last_5_observations, '[]'::jsonb) AS last_5_observations,
    na.next_appointment_id,
    na.next_appointment,
    na.next_appointment_time
FROM patients p
LEFT JOIN latest_observations lo ON lo.patient_id = p.resource_id
LEFT JOIN next_appointment na ON na.patient_id = p.resource_id;

-- Index unique pour refresh concurrent
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_cockpit_id 
ON patient_cockpit(patient_id);

-- Index pour recherche rapide par INS
CREATE INDEX IF NOT EXISTS idx_patient_cockpit_ins 
ON patient_cockpit(ins_value);

-- ============================================================================
-- SECTION 6: Optimized Query Functions
-- ============================================================================

-- Fonction: Récupérer le cockpit patient complet
-- Usage: SELECT * FROM get_patient_cockpit('PAT-123456');
CREATE OR REPLACE FUNCTION get_patient_cockpit(p_patient_id VARCHAR)
RETURNS TABLE (
    patient JSONB,
    last_5_observations JSONB,
    next_appointment JSONB,
    next_appointment_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Essayer d'abord la vue matérialisée (rapide)
    RETURN QUERY
    SELECT 
        pc.patient,
        pc.last_5_observations,
        pc.next_appointment,
        pc.next_appointment_time
    FROM patient_cockpit pc
    WHERE pc.patient_id = p_patient_id;
    
    -- Si aucun résultat, requête en temps réel
    IF NOT FOUND THEN
        RETURN QUERY
        WITH latest_obs AS (
            SELECT jsonb_agg(o.resource_json ORDER BY (o.resource_json->>'effectiveDateTime')::timestamp DESC)
            FROM (
                SELECT resource_json 
                FROM observations 
                WHERE patient_id = p_patient_id 
                ORDER BY (resource_json->>'effectiveDateTime')::timestamp DESC 
                LIMIT 5
            ) o
        ),
        next_apt AS (
            SELECT resource_json, start_time
            FROM appointments
            WHERE patient_id = p_patient_id
              AND status NOT IN ('cancelled', 'entered-in-error', 'noshow')
              AND start_time > NOW()
            ORDER BY start_time ASC
            LIMIT 1
        )
        SELECT 
            p.resource_json,
            COALESCE((SELECT * FROM latest_obs), '[]'::jsonb),
            (SELECT resource_json FROM next_apt),
            (SELECT start_time FROM next_apt)
        FROM patients p
        WHERE p.resource_id = p_patient_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: Refresh Trigger for Materialized View
-- ============================================================================

-- Fonction pour rafraîchir la vue après modifications
CREATE OR REPLACE FUNCTION refresh_patient_cockpit()
RETURNS TRIGGER AS $$
BEGIN
    -- Rafraîchissement asynchrone recommandé en production
    -- Ici on fait un refresh concurrent pour ne pas bloquer les lectures
    REFRESH MATERIALIZED VIEW CONCURRENTLY patient_cockpit;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Note: En production, utiliser pg_cron ou un job externe pour le refresh
-- plutôt que des triggers (performance)

COMMENT ON MATERIALIZED VIEW patient_cockpit IS 
'Vue optimisée pour le Cockpit Patient: combine les 5 dernières observations + prochain RDV. Rafraîchir avec: REFRESH MATERIALIZED VIEW CONCURRENTLY patient_cockpit;';
