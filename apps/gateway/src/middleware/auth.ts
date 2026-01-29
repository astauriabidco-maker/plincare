import { Request, Response, NextFunction } from 'express';
import { logger } from '@plincare/shared';

/**
 * Types de scopes FHIR SMART-on-FHIR
 * Format: patient|user|system / ResourceType . read|write|*
 */
export type FhirScope = string;

export interface AuthenticatedRequest extends Request {
    auth?: {
        sub: string;           // Subject (user/system ID)
        scopes: FhirScope[];   // Granted scopes
        clientId?: string;     // Application ID
    };
}

/**
 * Scopes requis par resource type et action
 */
const SCOPE_REQUIREMENTS: { [resourceType: string]: { read: string[]; write: string[] } } = {
    'Schedule': {
        read: ['system/Schedule.read', 'system/Schedule.*'],
        write: ['system/Schedule.write', 'system/Schedule.*']
    },
    'Slot': {
        read: ['system/Slot.read', 'system/Slot.*'],
        write: ['system/Slot.write', 'system/Slot.*']
    },
    'Appointment': {
        read: ['patient/Appointment.read', 'system/Appointment.read', 'system/Appointment.*'],
        write: ['patient/Appointment.write', 'system/Appointment.write', 'system/Appointment.*']
    },
    'HealthcareService': {
        read: ['system/HealthcareService.read', 'system/HealthcareService.*'],
        write: ['system/HealthcareService.write', 'system/HealthcareService.*']
    },
    'Observation': {
        read: ['patient/Observation.read', 'system/Observation.read'],
        write: ['system/Observation.write']
    },
    'Patient': {
        read: ['patient/Patient.read', 'system/Patient.read'],
        write: ['system/Patient.write']
    }
};

/**
 * Décode un JWT (sans vérification cryptographique - pour MVP/stub)
 * En production: utiliser jsonwebtoken avec vérification de signature
 */
function decodeJwtPayload(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

/**
 * Vérifie si les scopes requis sont présents dans les scopes accordés
 */
function hasRequiredScope(grantedScopes: string[], requiredScopes: string[]): boolean {
    // Wildcard scope pour admin
    if (grantedScopes.includes('system/*.*')) return true;

    return requiredScopes.some(required => grantedScopes.includes(required));
}

/**
 * Middleware d'authentification Bearer Token
 * Configure BYPASS_AUTH=true pour désactiver en développement
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    // Bypass pour développement local
    if (process.env.BYPASS_AUTH === 'true') {
        req.auth = {
            sub: 'DEV_USER',
            scopes: ['system/*.*'],
            clientId: 'dev-client'
        };
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'login',
                diagnostics: 'Missing or invalid Authorization header'
            }]
        });
        return;
    }

    const token = authHeader.substring(7);
    const decoded = decodeJwtPayload(token);

    if (!decoded) {
        res.status(401).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'invalid',
                diagnostics: 'Invalid token format'
            }]
        });
        return;
    }

    // Vérification expiration (exp claim)
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        res.status(401).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'expired',
                diagnostics: 'Token has expired'
            }]
        });
        return;
    }

    // Extraire scopes (format: "scope1 scope2 scope3" ou array)
    const scopes = Array.isArray(decoded.scope)
        ? decoded.scope
        : (decoded.scope || '').split(' ').filter(Boolean);

    req.auth = {
        sub: decoded.sub || 'unknown',
        scopes,
        clientId: decoded.client_id || decoded.azp
    };

    logger.info('Request authenticated', {
        sub: req.auth.sub,
        clientId: req.auth.clientId,
        scopeCount: scopes.length
    });

    next();
}

/**
 * Middleware factory pour vérifier les scopes requis
 */
export function requireScope(resourceType: string, action: 'read' | 'write') {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        // Bypass en mode dev
        if (process.env.BYPASS_AUTH === 'true') {
            return next();
        }

        if (!req.auth) {
            res.status(401).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'login',
                    diagnostics: 'Authentication required'
                }]
            });
            return;
        }

        const requirements = SCOPE_REQUIREMENTS[resourceType];
        if (!requirements) {
            // Resource type non protégé
            return next();
        }

        const requiredScopes = requirements[action];
        if (!hasRequiredScope(req.auth.scopes, requiredScopes)) {
            logger.warn('Insufficient scope', {
                sub: req.auth.sub,
                resourceType,
                action,
                granted: req.auth.scopes,
                required: requiredScopes
            });

            res.status(403).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'forbidden',
                    diagnostics: `Insufficient scope. Required one of: ${requiredScopes.join(', ')}`
                }]
            });
            return;
        }

        next();
    };
}

/**
 * Export des scopes pour documentation
 */
export const FHIR_SCOPES = SCOPE_REQUIREMENTS;
