/**
 * MSSanté Client - Messagerie Sécurisée de Santé
 * Envoi d'emails sécurisés via SMTP/STARTTLS (TLS 1.2+)
 * Conforme Référentiel #2 Clients MSS ANS
 */

import * as nodemailer from 'nodemailer';
import { logger, auditLogger } from '@plincare/shared';

// =============================================================================
// Types
// =============================================================================

export interface MssanteConfig {
    host: string;           // Serveur SMTP opérateur MSSanté
    port: number;           // 587 (STARTTLS)
    secure: boolean;        // false pour STARTTLS, true pour SMTPS
    user?: string;          // BAL MSSanté (ex: bal.pfi@mssante.fr)
    password?: string;      // Mot de passe BAL
    certPath?: string;      // Chemin certificat ORG_AUTH_CLI
    keyPath?: string;       // Chemin clé privée
    rejectUnauthorized?: boolean;
}

export interface SecureEmailOptions {
    from: string;           // Expéditeur (BAL MSSanté)
    to: string;             // Destinataire @mssante.fr
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
    patientId?: string;     // Pour audit
    encounterId?: string;   // Pour audit
}

export interface EmailAttachment {
    filename: string;
    content: string | Buffer;
    contentType: string;
    encoding?: 'base64' | 'binary';
}

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    timestamp: string;
}

// =============================================================================
// Default Configuration (Mode Simulation)
// =============================================================================

const DEFAULT_CONFIG: MssanteConfig = {
    host: process.env.MSSANTE_SMTP_HOST || 'localhost',
    port: parseInt(process.env.MSSANTE_SMTP_PORT || '587'),
    secure: false, // STARTTLS
    user: process.env.MSSANTE_USER || 'pfi@mssante.local',
    password: process.env.MSSANTE_PASSWORD || '',
    rejectUnauthorized: process.env.NODE_ENV === 'production'
};

// =============================================================================
// MSSanté Client Class
// =============================================================================

export class MssanteClient {
    private config: MssanteConfig;
    private transporter: nodemailer.Transporter | null = null;

    constructor(config?: Partial<MssanteConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialise le transporteur SMTP avec TLS 1.2+
     */
    async connect(): Promise<void> {
        logger.info('Initializing MSSanté SMTP client', {
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure
        });

        const tlsOptions: any = {
            minVersion: 'TLSv1.2', // Exigence Ségur
            rejectUnauthorized: this.config.rejectUnauthorized
        };

        // Si certificat ORG_AUTH_CLI fourni
        if (this.config.certPath && this.config.keyPath) {
            const fs = await import('fs');
            tlsOptions.cert = fs.readFileSync(this.config.certPath);
            tlsOptions.key = fs.readFileSync(this.config.keyPath);
            logger.info('Using ORG_AUTH_CLI certificate for MSSanté');
        }

        this.transporter = nodemailer.createTransport({
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure,
            auth: this.config.user ? {
                user: this.config.user,
                pass: this.config.password
            } : undefined,
            tls: tlsOptions,
            requireTLS: true // Force STARTTLS
        });

        // Vérifier la connexion
        try {
            await this.transporter.verify();
            logger.info('MSSanté SMTP connection verified successfully');
        } catch (error: any) {
            logger.warn('MSSanté SMTP verification failed (may work in simulation mode)', {
                error: error.message
            });
        }
    }

    /**
     * Envoie un email sécurisé avec pièces jointes CDA
     */
    async sendSecureEmail(options: SecureEmailOptions): Promise<SendResult> {
        const { from, to, subject, body, attachments, patientId, encounterId } = options;

        // Validation domaine MSSanté
        if (!this.isValidMssanteAddress(to)) {
            logger.warn('Recipient is not a valid MSSanté address', { to });
            // On continue quand même en mode simulation
        }

        logger.info('Sending secure MSSanté email', {
            from,
            to,
            subject,
            attachmentCount: attachments?.length || 0,
            patientId
        });

        if (!this.transporter) {
            await this.connect();
        }

        try {
            const mailOptions: nodemailer.SendMailOptions = {
                from,
                to,
                subject,
                text: body,
                html: `<html><body><p>${body.replace(/\n/g, '<br/>')}</p></body></html>`,
                attachments: attachments?.map(att => ({
                    filename: att.filename,
                    content: att.content,
                    contentType: att.contentType,
                    encoding: att.encoding || 'base64'
                }))
            };

            const result = await this.transporter!.sendMail(mailOptions);

            const sendResult: SendResult = {
                success: true,
                messageId: result.messageId,
                timestamp: new Date().toISOString()
            };

            // Audit Ségur - Envoi réussi
            auditLogger.log({
                actor_id: from,
                action_type: 'MSSANTE_SENT',
                resource_id: patientId || 'UNKNOWN',
                resource_type: 'MSSANTE_MESSAGE',
                outcome: 'success',
                details: {
                    recipient: to,
                    messageId: result.messageId,
                    encounterId,
                    attachmentCount: attachments?.length || 0
                }
            });

            logger.info('MSSanté email sent successfully', {
                messageId: result.messageId,
                to
            });

            return sendResult;

        } catch (error: any) {
            const sendResult: SendResult = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };

            // Audit Ségur - Échec
            auditLogger.log({
                actor_id: from,
                action_type: 'MSSANTE_FAILED',
                resource_id: patientId || 'UNKNOWN',
                resource_type: 'MSSANTE_MESSAGE',
                outcome: 'failure',
                details: {
                    recipient: to,
                    error: error.message,
                    encounterId
                }
            });

            logger.error('MSSanté email send failed', {
                error: error.message,
                to
            });

            return sendResult;
        }
    }

    /**
     * Envoie une Lettre de Liaison avec CDA en pièce jointe
     */
    async sendLettreDeLiaison(
        recipientMssante: string,
        patientName: string,
        cdaXml: string,
        encounterId: string,
        patientId: string
    ): Promise<SendResult> {
        const cdaBase64 = Buffer.from(cdaXml, 'utf8').toString('base64');

        return this.sendSecureEmail({
            from: this.config.user || 'pfi@mssante.local',
            to: recipientMssante,
            subject: `Lettre de Liaison - Patient ${patientName} - Séjour ${encounterId}`,
            body: `
Cher(e) Confrère/Consœur,

Veuillez trouver ci-joint la Lettre de Liaison concernant votre patient ${patientName} 
suite à la clôture de son séjour (${encounterId}).

Ce document est au format CDA R2 N1 conforme CI-SIS ANS, 
compatible avec Mon Espace Santé.

Cordialement,
L'équipe médicale

---
Ce message a été généré automatiquement par la Plateforme de Flux Interopérable (PFI).
            `.trim(),
            attachments: [{
                filename: `lettre_liaison_${encounterId}.xml`,
                content: cdaBase64,
                contentType: 'application/xml',
                encoding: 'base64'
            }],
            patientId,
            encounterId
        });
    }

    /**
     * Vérifie si une adresse est une adresse MSSanté valide
     */
    isValidMssanteAddress(email: string): boolean {
        // Domaines MSSanté officiels
        const mssanteDomains = [
            '@mssante.fr',
            '@patient.mssante.fr',
            '@medecin.mssante.fr',
            '@pharmacien.mssante.fr',
            '@infirmier.mssante.fr',
            '@etablissement.mssante.fr'
        ];

        // Vérifier si le domaine correspond
        return mssanteDomains.some(domain =>
            email.toLowerCase().endsWith(domain) ||
            email.toLowerCase().includes('.mssante.fr')
        );
    }

    /**
     * Ferme la connexion SMTP
     */
    async disconnect(): Promise<void> {
        if (this.transporter) {
            this.transporter.close();
            this.transporter = null;
            logger.info('MSSanté SMTP connection closed');
        }
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let clientInstance: MssanteClient | null = null;

export function getMssanteClient(config?: Partial<MssanteConfig>): MssanteClient {
    if (!clientInstance) {
        clientInstance = new MssanteClient(config);
    }
    return clientInstance;
}

export default MssanteClient;
