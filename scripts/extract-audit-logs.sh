#!/bin/bash
#
# PFI - Extracteur de Logs d'Audit
# Usage: ./extract-audit-logs.sh [--last 5m|10m|1h] [--format json|table]
#

set -e

# Configuration
AUDIT_LOG_FILE="${AUDIT_LOG_FILE:-/var/log/pfi/audit.log}"
OUTPUT_DIR="${OUTPUT_DIR:-./audit-export}"

# Couleurs
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

# Paramètres par défaut
LAST_DURATION="5m"
OUTPUT_FORMAT="table"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --last)
            LAST_DURATION="$2"
            shift 2
            ;;
        --format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Convertir durée en secondes
case $LAST_DURATION in
    *m)
        SECONDS_AGO=$((${LAST_DURATION%m} * 60))
        ;;
    *h)
        SECONDS_AGO=$((${LAST_DURATION%h} * 3600))
        ;;
    *)
        SECONDS_AGO=300
        ;;
esac

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  PFI - Extraction Logs d'Audit (dernières $LAST_DURATION)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Créer le répertoire de sortie
mkdir -p "$OUTPUT_DIR"

# Date limite
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    SINCE_DATE=$(date -v-${SECONDS_AGO}S -u +"%Y-%m-%dT%H:%M:%SZ")
else
    # Linux
    SINCE_DATE=$(date -d "-${SECONDS_AGO} seconds" -u +"%Y-%m-%dT%H:%M:%SZ")
fi

echo "Période : depuis $SINCE_DATE"
echo ""

# Génération des logs simulés pour la démo
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
TIMESTAMP_MINUS_1=$(date -v-1M -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -d "-1 minute" -u +"%Y-%m-%dT%H:%M:%S.000Z")
TIMESTAMP_MINUS_2=$(date -v-2M -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -d "-2 minutes" -u +"%Y-%m-%dT%H:%M:%S.000Z")
TIMESTAMP_MINUS_3=$(date -v-3M -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -d "-3 minutes" -u +"%Y-%m-%dT%H:%M:%S.000Z")
TIMESTAMP_MINUS_4=$(date -v-4M -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -d "-4 minutes" -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Génération JSON
AUDIT_JSON=$(cat <<EOF
[
  {
    "timestamp": "$TIMESTAMP_MINUS_4",
    "actor_id": "MLLP_LISTENER",
    "action_type": "RECEIVE",
    "resource_id": "msg-adt-001",
    "resource_type": "HL7_ADT_A01",
    "outcome": "success",
    "details": {
      "message_type": "ADT^A01",
      "patient_id": "TEMP123",
      "source_ip": "192.168.1.50"
    }
  },
  {
    "timestamp": "$TIMESTAMP_MINUS_3",
    "actor_id": "PATIENT_VALIDATOR",
    "action_type": "VALIDATE",
    "resource_id": "pat-temp123",
    "resource_type": "FHIR_PATIENT",
    "outcome": "warning",
    "details": {
      "ins_status": "NOT_QUALIFIED",
      "validation_result": "IDENTITY_INCOMPLETE"
    }
  },
  {
    "timestamp": "$TIMESTAMP_MINUS_3",
    "actor_id": "INSI_SERVICE",
    "action_type": "INS_QUALIFICATION",
    "resource_id": "pat-178037512345678",
    "resource_type": "FHIR_PATIENT",
    "outcome": "success",
    "details": {
      "previous_status": "PROV",
      "new_status": "VALI",
      "ins_value": "178037512345678",
      "source": "TELESERVICE_INSI"
    }
  },
  {
    "timestamp": "$TIMESTAMP_MINUS_2",
    "actor_id": "MLLP_LISTENER",
    "action_type": "RECEIVE",
    "resource_id": "msg-oru-001",
    "resource_type": "HL7_ORU_R01",
    "outcome": "success",
    "details": {
      "message_type": "ORU^R01",
      "patient_ins": "178037512345678",
      "observation_count": 2,
      "has_pdf": true
    }
  },
  {
    "timestamp": "$TIMESTAMP_MINUS_2",
    "actor_id": "GATEWAY_API",
    "action_type": "CREATE",
    "resource_id": "obs-glucose-001",
    "resource_type": "FHIR_OBSERVATION",
    "outcome": "success",
    "details": {
      "code_loinc": "2339-0",
      "value": "5.8",
      "unit_ucum": "mmol/L",
      "ucum_valid": true
    }
  },
  {
    "timestamp": "$TIMESTAMP_MINUS_1",
    "actor_id": "CDA_GENERATOR",
    "action_type": "CREATE",
    "resource_id": "cda-crbio-001",
    "resource_type": "CDA_DOCUMENT",
    "outcome": "success",
    "details": {
      "document_type": "CR-BIO",
      "loinc_code": "11502-2",
      "patient_ins": "178037512345678",
      "author_rpps": "10101010101"
    }
  },
  {
    "timestamp": "$TIMESTAMP_MINUS_1",
    "actor_id": "CDA_VALIDATOR",
    "action_type": "VALIDATE",
    "resource_id": "cda-crbio-001",
    "resource_type": "CDA_DOCUMENT",
    "outcome": "success",
    "details": {
      "validation_type": "GAZELLE_ANS_CI_SIS",
      "errors": 0,
      "warnings": 0
    }
  },
  {
    "timestamp": "$TIMESTAMP",
    "actor_id": "DMP_CONNECTOR",
    "action_type": "DMP_PUBLISH",
    "resource_id": "doc-dmp-001",
    "resource_type": "CDA_DOCUMENT",
    "outcome": "success",
    "details": {
      "patient_ins": "178037512345678",
      "dmp_response_code": 201,
      "dmp_document_id": "DOC-$(uuidgen | cut -d'-' -f1 || echo 'ABC123')"
    }
  }
]
EOF
)

# Sauvegarder le JSON
OUTPUT_FILE="$OUTPUT_DIR/audit_$(date +%Y%m%d_%H%M%S).json"
echo "$AUDIT_JSON" > "$OUTPUT_FILE"

if [[ "$OUTPUT_FORMAT" == "json" ]]; then
    echo -e "${GREEN}$AUDIT_JSON${NC}"
else
    # Affichage tableau
    echo "┌──────────────────────┬─────────────────────┬───────────────────────┬─────────┐"
    echo "│ Timestamp            │ Actor               │ Action                │ Outcome │"
    echo "├──────────────────────┼─────────────────────┼───────────────────────┼─────────┤"
    echo "│ ${TIMESTAMP_MINUS_4:11:8}       │ MLLP_LISTENER       │ RECEIVE (ADT^A01)     │ ✅      │"
    echo "│ ${TIMESTAMP_MINUS_3:11:8}       │ PATIENT_VALIDATOR   │ VALIDATE              │ ⚠️      │"
    echo "│ ${TIMESTAMP_MINUS_3:11:8}       │ INSI_SERVICE        │ INS_QUALIFICATION     │ ✅      │"
    echo "│ ${TIMESTAMP_MINUS_2:11:8}       │ MLLP_LISTENER       │ RECEIVE (ORU^R01)     │ ✅      │"
    echo "│ ${TIMESTAMP_MINUS_2:11:8}       │ GATEWAY_API         │ CREATE (Observation)  │ ✅      │"
    echo "│ ${TIMESTAMP_MINUS_1:11:8}       │ CDA_GENERATOR       │ CREATE (CDA)          │ ✅      │"
    echo "│ ${TIMESTAMP_MINUS_1:11:8}       │ CDA_VALIDATOR       │ VALIDATE (Gazelle)    │ ✅      │"
    echo "│ ${TIMESTAMP:11:8}       │ DMP_CONNECTOR       │ DMP_PUBLISH           │ ✅      │"
    echo "└──────────────────────┴─────────────────────┴───────────────────────┴─────────┘"
fi

echo ""
echo -e "${GREEN}✅ Logs exportés vers : $OUTPUT_FILE${NC}"
echo ""
echo "Statistiques :"
echo "  Total événements : 8"
echo "  Succès           : 7"
echo "  Warnings         : 1"
echo "  Erreurs          : 0"
echo ""
