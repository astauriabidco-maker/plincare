/**
 * MSSanté Routes - API de messagerie sécurisée
 */

import { Router, Request, Response } from 'express';
import { logger } from '@plincare/shared';

const router = Router();

// Import dynamique pour éviter les dépendances circulaires
const loadModules = async () => {
    const { getMssanteClient } = await import('../../integration-engine-client');
    const { getAnnuaireClient } = await import('../../integration-engine-client');
    return { getMssanteClient, getAnnuaireClient };
};

/**
 * POST /api/mssante/send
 * Envoie un email sécurisé via MSSanté
 */
router.post('/send', async (req: Request, res: Response) => {
    try {
        const {
            recipientRpps,
            recipientEmail,
            subject,
            body,
            patientId,
            cdaXml,
            attachments
        } = req.body;

        if (!subject || !body) {
            res.status(400).json({ error: 'Missing required fields: subject, body' });
            return;
        }

        // Déterminer l'adresse destinataire
        let targetEmail = recipientEmail;

        if (!targetEmail && recipientRpps) {
            // Lookup via Annuaire Santé
            logger.info('Looking up MSSanté address from RPPS', { rppsId: recipientRpps });

            // Simulation: générer une adresse mock
            targetEmail = `dr.${recipientRpps.substring(0, 6)}@medecin.mssante.fr`;
        }

        if (!targetEmail) {
            res.status(400).json({ error: 'Either recipientEmail or recipientRpps must be provided' });
            return;
        }

        // Préparer les pièces jointes
        const emailAttachments: any[] = attachments || [];

        if (cdaXml) {
            emailAttachments.push({
                filename: `document_${Date.now()}.xml`,
                content: Buffer.from(cdaXml, 'utf8').toString('base64'),
                contentType: 'application/xml',
                encoding: 'base64'
            });
        }

        // En mode simulation, on log et retourne succès
        // TODO: Intégrer avec le vrai client MSSanté
        logger.info('MSSanté send request (simulation mode)', {
            to: targetEmail,
            subject,
            attachmentCount: emailAttachments.length,
            patientId
        });

        res.status(200).json({
            success: true,
            messageId: `sim-${Date.now()}`,
            recipient: targetEmail,
            message: 'Email queued for delivery (simulation mode)',
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        logger.error('MSSanté send failed', { error: error.message });
        res.status(500).json({
            error: 'Failed to send MSSanté message',
            message: error.message
        });
    }
});

/**
 * POST /api/mssante/lookup-rpps
 * Recherche l'adresse MSSanté d'un praticien par RPPS
 */
router.post('/lookup-rpps', async (req: Request, res: Response) => {
    try {
        const { rppsId } = req.body;

        if (!rppsId) {
            res.status(400).json({ error: 'Missing required field: rppsId' });
            return;
        }

        logger.info('RPPS lookup request', { rppsId });

        // Simulation mode
        const practitionerInfo = {
            rppsId,
            familyName: 'MARTIN',
            givenName: 'Sophie',
            profession: 'Médecin généraliste',
            mssanteAddress: `dr.martin.${rppsId.substring(0, 5)}@medecin.mssante.fr`,
            organization: 'Cabinet Médical Paris'
        };

        res.json({
            found: true,
            practitioner: practitionerInfo
        });

    } catch (error: any) {
        logger.error('RPPS lookup failed', { error: error.message });
        res.status(500).json({
            error: 'Failed to lookup RPPS',
            message: error.message
        });
    }
});

/**
 * GET /api/mssante/status
 * Statut du module MSSanté
 */
router.get('/status', (req: Request, res: Response) => {
    res.json({
        status: 'operational',
        mode: process.env.NODE_ENV === 'production' ? 'production' : 'simulation',
        features: {
            smtp: {
                enabled: true,
                host: process.env.MSSANTE_SMTP_HOST || 'localhost',
                port: process.env.MSSANTE_SMTP_PORT || 587
            },
            imap: {
                enabled: false, // À activer en production
                host: process.env.MSSANTE_IMAP_HOST || 'localhost',
                port: process.env.MSSANTE_IMAP_PORT || 993
            },
            annuaire: {
                enabled: true,
                baseUrl: process.env.ANNUAIRE_API_URL || 'https://gateway.api.esante.gouv.fr/fhir/v1'
            }
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /api/mssante/verify-sender
 * Vérifie si une adresse est autorisée (domaine MSSanté)
 */
router.post('/verify-sender', (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
        res.status(400).json({ error: 'Missing required field: email' });
        return;
    }

    const authorizedDomains = [
        'mssante.fr',
        'medecin.mssante.fr',
        'pharmacien.mssante.fr',
        'infirmier.mssante.fr',
        'etablissement.mssante.fr',
        'patient.mssante.fr'
    ];

    const domain = email.toLowerCase().split('@')[1];
    const isAuthorized = authorizedDomains.some(
        d => domain === d || domain?.endsWith('.' + d)
    );

    res.json({
        email,
        domain,
        isAuthorized,
        message: isAuthorized
            ? 'Sender is within MSSanté trust space'
            : 'Sender is NOT within MSSanté trust space'
    });
});

export default router;
