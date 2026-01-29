#!/bin/bash

# Configuration
HOST="localhost"
PORT=2100

# Message HL7 exemple (ADT^A01)
# Utilisation des caractères MLLP : Start (0x0b), End (0x1c), Trailer (0x0d)
VT='\x0b'
FS='\x1c'
CR='\x0d'

MESSAGE="MSH|^~\\&|SENDER|FACILITY|PFI|RECEIVER|202310271030||ADT^A01|101|P|2.5\rPID|||12345^^^MRN||DOE^JOHN||19800101|M|||123 MAIN ST^^ANYTOWN^NY^12345||555-555-5555|||M|NON|123456789\rPV1||I|NURSING UNIT^101^1"

echo "Envoi du message HL7 vers $HOST:$PORT..."

# Utilisation de printf pour injecter les codes hexa et nc pour l'envoi
printf "$VT$MESSAGE$FS$CR" | nc -w 1 $HOST $PORT

echo -e "\nMessage envoyé. Vérifiez les logs de l'Integration Engine."
