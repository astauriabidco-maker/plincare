import { logger } from '@plincare/shared';

/**
 * FHIR Subscription Manager
 * Gère les souscriptions webhooks pour notifications temps réel (<2s latence)
 */

export interface FhirSubscription {
    id: string;
    resourceType: string;      // Ex: 'Appointment'
    criteria?: string;         // FHIR search criteria (ex: 'Appointment?status=cancelled')
    channelType: 'rest-hook' | 'websocket';
    endpoint: string;          // Webhook URL
    status: 'active' | 'off' | 'error';
    headers?: { [key: string]: string };  // Headers additionnels pour le webhook
    createdAt: Date;
    lastTriggeredAt?: Date;
}

// Stockage en mémoire (en production: utiliser PostgreSQL fhir_subscriptions)
const subscriptions: Map<string, FhirSubscription> = new Map();

/**
 * Enregistre une nouvelle souscription
 */
export function registerSubscription(subscription: Omit<FhirSubscription, 'createdAt'>): FhirSubscription {
    const fullSubscription: FhirSubscription = {
        ...subscription,
        createdAt: new Date()
    };

    subscriptions.set(subscription.id, fullSubscription);

    logger.info('Subscription registered', {
        id: subscription.id,
        resourceType: subscription.resourceType,
        endpoint: subscription.endpoint
    });

    return fullSubscription;
}

/**
 * Supprime une souscription
 */
export function removeSubscription(id: string): boolean {
    const deleted = subscriptions.delete(id);
    if (deleted) {
        logger.info('Subscription removed', { id });
    }
    return deleted;
}

/**
 * Récupère toutes les souscriptions actives pour un type de ressource
 */
export function getActiveSubscriptions(resourceType: string): FhirSubscription[] {
    return Array.from(subscriptions.values())
        .filter(sub => sub.status === 'active' && sub.resourceType === resourceType);
}

/**
 * Déclenche les webhooks pour un événement sur une ressource
 * @param resourceType - Type de ressource FHIR
 * @param resource - La ressource FHIR concernée
 * @param event - Type d'événement (create, update, delete)
 */
export async function triggerWebhooks(
    resourceType: string,
    resource: any,
    event: 'create' | 'update' | 'delete'
): Promise<{ sent: number; failed: number }> {
    const startTime = Date.now();
    const activeSubscriptions = getActiveSubscriptions(resourceType);

    if (activeSubscriptions.length === 0) {
        return { sent: 0, failed: 0 };
    }

    logger.info(`Triggering ${activeSubscriptions.length} webhooks for ${resourceType}`, { event });

    const results = await Promise.allSettled(
        activeSubscriptions.map(async (sub) => {
            try {
                // Vérifier critères si présents
                if (sub.criteria && !matchesCriteria(resource, sub.criteria)) {
                    return { skipped: true };
                }

                const payload = {
                    subscription: sub.id,
                    resourceType,
                    event,
                    resource,
                    timestamp: new Date().toISOString()
                };

                const response = await fetch(sub.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/fhir+json',
                        ...sub.headers
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(1500) // Timeout 1.5s pour garantir <2s total
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // Mettre à jour lastTriggeredAt
                sub.lastTriggeredAt = new Date();

                return { sent: true };
            } catch (err: any) {
                logger.error('Webhook failed', {
                    subscriptionId: sub.id,
                    endpoint: sub.endpoint,
                    error: err.message
                });

                // Marquer la subscription en erreur après 3 échecs consécutifs
                // (logique simplifiée ici)
                return { failed: true };
            }
        })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any).sent).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any).failed)).length;

    const latency = Date.now() - startTime;
    logger.info('Webhooks completed', {
        sent,
        failed,
        latencyMs: latency,
        underTarget: latency < 2000
    });

    return { sent, failed };
}

/**
 * Vérifie si une ressource correspond aux critères FHIR d'une subscription
 * Implémentation simplifiée - en production utiliser un parser FHIR Search
 */
function matchesCriteria(resource: any, criteria: string): boolean {
    // Parse simple des critères (ex: "Appointment?status=cancelled")
    const parts = criteria.split('?');
    if (parts.length !== 2) return true;

    const params = new URLSearchParams(parts[1]);

    for (const [key, value] of params.entries()) {
        if (resource[key] !== value) {
            return false;
        }
    }

    return true;
}

/**
 * Récupère toutes les souscriptions (pour admin)
 */
export function getAllSubscriptions(): FhirSubscription[] {
    return Array.from(subscriptions.values());
}

/**
 * Récupère une souscription par ID
 */
export function getSubscription(id: string): FhirSubscription | undefined {
    return subscriptions.get(id);
}

/**
 * Met à jour le statut d'une souscription
 */
export function updateSubscriptionStatus(id: string, status: 'active' | 'off' | 'error'): boolean {
    const sub = subscriptions.get(id);
    if (!sub) return false;

    sub.status = status;
    logger.info('Subscription status updated', { id, status });
    return true;
}
