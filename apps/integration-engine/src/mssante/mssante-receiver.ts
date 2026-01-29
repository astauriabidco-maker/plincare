/**
 * MSSanté Receiver - Réception sécurisée de messages
 * Client IMAP4 avec vérification expéditeur et audit
 */

import { logger, auditLogger } from '@plincare/shared';

// =============================================================================
// Types
// =============================================================================

export interface MssanteReceiverConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    certPath?: string;
    keyPath?: string;
    pollingIntervalMs?: number;
    authorizedDomains?: string[];
}

export interface ReceivedMessage {
    id: string;
    from: string;
    to: string;
    subject: string;
    date: Date;
    body: string;
    attachments: ReceivedAttachment[];
    isAuthorized: boolean;
}

export interface ReceivedAttachment {
    filename: string;
    contentType: string;
    content: Buffer;
    size: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Partial<MssanteReceiverConfig> = {
    host: process.env.MSSANTE_IMAP_HOST || 'localhost',
    port: parseInt(process.env.MSSANTE_IMAP_PORT || '993'),
    secure: true,
    user: process.env.MSSANTE_USER || '',
    password: process.env.MSSANTE_PASSWORD || '',
    pollingIntervalMs: 60000, // 1 minute
    authorizedDomains: [
        'mssante.fr',
        'medecin.mssante.fr',
        'pharmacien.mssante.fr',
        'infirmier.mssante.fr',
        'etablissement.mssante.fr',
        'patient.mssante.fr'
    ]
};

// =============================================================================
// MSSanté Receiver Class
// =============================================================================

export class MssanteReceiver {
    private config: MssanteReceiverConfig;
    private isRunning: boolean = false;
    private pollingInterval: NodeJS.Timeout | null = null;
    private processedMessageIds: Set<string> = new Set();

    constructor(config: Partial<MssanteReceiverConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config } as MssanteReceiverConfig;
    }

    /**
     * Démarre la réception périodique des messages
     */
    start(): void {
        if (this.isRunning) {
            logger.warn('MSSanté receiver already running');
            return;
        }

        logger.info('Starting MSSanté receiver', {
            host: this.config.host,
            port: this.config.port,
            pollingInterval: this.config.pollingIntervalMs
        });

        this.isRunning = true;
        this.pollMessages(); // Premier poll immédiat

        this.pollingInterval = setInterval(
            () => this.pollMessages(),
            this.config.pollingIntervalMs || 60000
        );
    }

    /**
     * Arrête la réception
     */
    stop(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isRunning = false;
        logger.info('MSSanté receiver stopped');
    }

    /**
     * Poll les nouveaux messages
     */
    private async pollMessages(): Promise<void> {
        logger.debug('Polling MSSanté inbox');

        try {
            // En mode simulation, on log simplement
            // Production: implémenter avec imap ou node-imap
            if (process.env.NODE_ENV !== 'production' && !process.env.MSSANTE_IMAP_HOST) {
                logger.debug('IMAP polling skipped (simulation mode)');
                return;
            }

            // TODO: Implémenter avec imap-simple ou node-imap
            // const connection = await imaps.connect(imapConfig);
            // const messages = await connection.search(['UNSEEN'], { bodies: [''] });
            // ...

            logger.debug('IMAP polling would check for new messages');

        } catch (error: any) {
            logger.error('Failed to poll MSSanté inbox', {
                error: error.message
            });
        }
    }

    /**
     * Traite un message reçu
     */
    async processMessage(message: ReceivedMessage): Promise<{
        accepted: boolean;
        reason?: string;
        patientId?: string;
    }> {
        logger.info('Processing received MSSanté message', {
            from: message.from,
            subject: message.subject,
            attachmentCount: message.attachments.length
        });

        // Vérifier si déjà traité
        if (this.processedMessageIds.has(message.id)) {
            return { accepted: false, reason: 'Already processed' };
        }

        // Vérifier l'expéditeur
        const senderAuthorized = this.verifySender(message.from);

        if (!senderAuthorized) {
            logger.warn('Unauthorized sender rejected', { from: message.from });

            auditLogger.log({
                actor_id: message.from,
                action_type: 'MSSANTE_RECEIVED',
                resource_id: message.id,
                resource_type: 'MSSANTE_MESSAGE',
                outcome: 'failure',
                details: {
                    reason: 'Unauthorized sender domain',
                    from: message.from,
                    subject: message.subject
                }
            });

            return {
                accepted: false,
                reason: `Sender domain not authorized: ${message.from}`
            };
        }

        // Traiter les pièces jointes (CDA, PDF...)
        let patientId: string | undefined;

        for (const attachment of message.attachments) {
            const result = await this.processAttachment(attachment, message);
            if (result.patientId) {
                patientId = result.patientId;
            }
        }

        // Marquer comme traité
        this.processedMessageIds.add(message.id);

        // Audit Trail - Réception réussie
        auditLogger.log({
            actor_id: message.from,
            action_type: 'MSSANTE_RECEIVED',
            resource_id: message.id,
            resource_type: 'MSSANTE_MESSAGE',
            outcome: 'success',
            details: {
                from: message.from,
                subject: message.subject,
                attachmentCount: message.attachments.length,
                patientId
            }
        });

        logger.info('MSSanté message processed successfully', {
            messageId: message.id,
            patientId
        });

        return { accepted: true, patientId };
    }

    /**
     * Vérifie si l'expéditeur est autorisé (domaine MSSanté)
     */
    verifySender(email: string): boolean {
        const emailLower = email.toLowerCase();
        const domain = emailLower.split('@')[1];

        if (!domain) {
            return false;
        }

        // Vérifier si le domaine est dans la liste autorisée
        return this.config.authorizedDomains?.some(
            authorizedDomain =>
                domain === authorizedDomain ||
                domain.endsWith('.' + authorizedDomain)
        ) || false;
    }

    /**
     * Traite une pièce jointe
     */
    private async processAttachment(
        attachment: ReceivedAttachment,
        message: ReceivedMessage
    ): Promise<{ patientId?: string }> {
        logger.info('Processing attachment', {
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size
        });

        // Détecter le type de document
        if (attachment.contentType === 'application/xml' ||
            attachment.filename.endsWith('.xml')) {
            // Document CDA potentiel
            return this.processCdaAttachment(attachment);
        }

        if (attachment.contentType === 'application/pdf' ||
            attachment.filename.endsWith('.pdf')) {
            // Document PDF
            return this.processPdfAttachment(attachment);
        }

        logger.debug('Unknown attachment type, storing raw', {
            filename: attachment.filename
        });

        return {};
    }

    /**
     * Traite un document CDA reçu
     */
    private async processCdaAttachment(
        attachment: ReceivedAttachment
    ): Promise<{ patientId?: string }> {
        const cdaContent = attachment.content.toString('utf8');

        // Extraire l'INS du patient depuis le CDA
        const insMatch = cdaContent.match(
            /root="1\.2\.250\.1\.213\.1\.4\.5"[^>]*extension="([^"]+)"/
        );
        const patientId = insMatch?.[1];

        if (patientId) {
            logger.info('Extracted patient INS from CDA', { patientId });

            // TODO: Créer/mettre à jour le DocumentReference FHIR
            // await createDocumentReference(patientId, cdaContent);
        }

        return { patientId };
    }

    /**
     * Traite un document PDF reçu
     */
    private async processPdfAttachment(
        attachment: ReceivedAttachment
    ): Promise<{ patientId?: string }> {
        // TODO: Stocker dans le système de fichiers/S3
        // TODO: Créer DocumentReference FHIR

        logger.info('PDF attachment received, would store in document system', {
            filename: attachment.filename,
            size: attachment.size
        });

        return {};
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let receiverInstance: MssanteReceiver | null = null;

export function getMssanteReceiver(
    config?: Partial<MssanteReceiverConfig>
): MssanteReceiver {
    if (!receiverInstance) {
        receiverInstance = new MssanteReceiver(config || {});
    }
    return receiverInstance;
}

export default MssanteReceiver;
