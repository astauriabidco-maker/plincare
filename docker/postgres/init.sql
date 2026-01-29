-- Extension pour JSONB optimisé si besoin (déjà inclus nativement dans Postgres 9.4+)
-- Création des tables de base pour FHIR

CREATE TABLE fhir_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    resource_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fhir_resource_type ON fhir_resources(resource_type);
CREATE INDEX idx_fhir_resource_json ON fhir_resources USING GIN (resource_json);

-- Table pour l'Audit Trail conforme Ségur
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actor_id VARCHAR(100),
    action_type VARCHAR(50),
    resource_id VARCHAR(100),
    resource_type VARCHAR(50),
    outcome VARCHAR(20),
    details JSONB
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);

-- Agent 2: Table Patient avec contraintes strictes Ségur
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(100) UNIQUE NOT NULL, -- IPP ou technique
    resource_json JSONB NOT NULL,
    ins_value VARCHAR(15), -- Matricule INS
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Contrainte : Un identifiant 'official' est obligatoire pour le nom
    -- On vérifie qu'il existe un objet dans l'array 'name' avec use 'official'
    CONSTRAINT check_official_name CHECK (
        resource_json @> '{"name": [{"use": "official"}]}'
    ),
    
    -- Contrainte : L'identifiant INS doit utiliser l'OID correct
    CONSTRAINT check_ins_oid CHECK (
        resource_json @> '{"identifier": [{"system": "urn:oid:1.2.250.1.213.1.4.5"}]}'
    )
);

CREATE INDEX idx_patient_ins ON patients(ins_value);
CREATE INDEX idx_patient_json ON patients USING GIN (resource_json);

-- Agent 2: Table DiagnosticReport avec lien strict vers Patient
CREATE TABLE diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(100) UNIQUE NOT NULL,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(resource_id), -- Contrainte "Zéro Orphelin"
    resource_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Contrainte : Le champ subject.reference du JSON doit correspondre au patient_id
    CONSTRAINT check_subject_link CHECK (
        resource_json->'subject'->>'reference' = 'Patient/' || patient_id
    )
);

CREATE INDEX idx_report_patient ON diagnostic_reports(patient_id);
CREATE INDEX idx_report_json ON diagnostic_reports USING GIN (resource_json);

-- Agent 2: Table Observation avec lien strict vers Patient
CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(100) UNIQUE NOT NULL,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(resource_id), -- Contrainte "Zéro Orphelin"
    resource_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Contrainte : Le champ subject.reference du JSON doit correspondre au patient_id
    CONSTRAINT check_subject_link_obs CHECK (
        resource_json->'subject'->>'reference' = 'Patient/' || patient_id
    )
);

CREATE INDEX idx_observation_patient ON observations(patient_id);
CREATE INDEX idx_observation_json ON observations USING GIN (resource_json);

-- Index pour la performance des requêtes temporelles sur les observations
-- Permet de récupérer rapidement les "5 derniers résultats"
CREATE INDEX idx_observation_patient_date ON observations(patient_id, ((resource_json->>'effectiveDateTime')::timestamp) DESC);

-- Agent 2: Scheduling Resources
-- Table Schedule
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(100) UNIQUE NOT NULL,
    resource_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table Slot
CREATE TABLE slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(100) UNIQUE NOT NULL,
    schedule_id VARCHAR(100) NOT NULL REFERENCES schedules(resource_id),
    resource_json JSONB NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL -- busy, free, etc.
);

CREATE INDEX idx_slot_schedule ON slots(schedule_id);
CREATE INDEX idx_slot_time ON slots(start_time);

-- Table Appointment
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(100) UNIQUE NOT NULL,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(resource_id),
    resource_json JSONB NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointment_patient ON appointments(patient_id);
-- Index pour la performance : "Prochain rendez-vous"
CREATE INDEX idx_appointment_patient_next ON appointments(patient_id, start_time ASC) WHERE status NOT IN ('cancelled', 'entered-in-error');

-- Vue Matérialisée ou Helper pour le "Patient Cockpit"
-- Cette vue (ou sa logique) est optimisée par les index ci-dessus.
COMMENT ON TABLE appointments IS 'Optimisé pour Agent 2 : Indexation temporelle pour Zéro Latence sur le Cockpit Patient';
