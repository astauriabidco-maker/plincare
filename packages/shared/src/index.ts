import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ],
});

export interface AuditLog {
    actor_id: string;
    action_type: string;
    resource_id: string;
    resource_type: string;
    outcome: 'success' | 'failure';
    details?: any;
}

export const auditLogger = {
    log: (entry: AuditLog) => {
        logger.info('Audit Trail', {
            type: 'AUDIT',
            ...entry,
            timestamp: new Date().toISOString()
        });
    }
};
