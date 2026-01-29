/**
 * Annuaire Santé Client - Lookup RPPS → MSSanté
 * API FHIR de l'Annuaire Santé (ANS)
 */

import { logger } from '@plincare/shared';

// =============================================================================
// Types
// =============================================================================

export interface PractitionerInfo {
    rppsId: string;
    familyName?: string;
    givenName?: string;
    profession?: string;
    specialties?: string[];
    mssanteAddress?: string;
    organization?: string;
    phone?: string;
    email?: string;
}

export interface AnnuaireClientConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
    cacheEnabled?: boolean;
    cacheTtlMs?: number;
}

interface CacheEntry {
    data: PractitionerInfo;
    timestamp: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: AnnuaireClientConfig = {
    baseUrl: process.env.ANNUAIRE_API_URL || 'https://gateway.api.esante.gouv.fr/fhir/v1',
    apiKey: process.env.ANNUAIRE_API_KEY,
    timeout: 10000,
    cacheEnabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000 // 24 heures
};

// =============================================================================
// Annuaire Santé Client
// =============================================================================

export class AnnuaireClient {
    private config: AnnuaireClientConfig;
    private cache: Map<string, CacheEntry> = new Map();

    constructor(config?: Partial<AnnuaireClientConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Recherche un professionnel de santé par RPPS
     */
    async lookupRpps(rppsId: string): Promise<PractitionerInfo | null> {
        logger.info('Looking up practitioner by RPPS', { rppsId });

        // Vérifier le cache
        if (this.config.cacheEnabled) {
            const cached = this.getFromCache(rppsId);
            if (cached) {
                logger.debug('Returning cached practitioner info', { rppsId });
                return cached;
            }
        }

        try {
            // Appel API Annuaire Santé FHIR
            const url = `${this.config.baseUrl}/Practitioner?identifier=${encodeURIComponent(
                `urn:oid:1.2.250.1.71.4.2.1|${rppsId}`
            )}`;

            const headers: Record<string, string> = {
                'Accept': 'application/fhir+json',
                'Content-Type': 'application/fhir+json'
            };

            if (this.config.apiKey) {
                headers['ESANTE-API-KEY'] = this.config.apiKey;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(this.config.timeout || 10000)
            });

            if (!response.ok) {
                if (response.status === 404) {
                    logger.warn('Practitioner not found in Annuaire Santé', { rppsId });
                    return null;
                }
                throw new Error(`Annuaire API error: ${response.status} ${response.statusText}`);
            }

            const bundle = await response.json();

            if (!bundle.entry || bundle.entry.length === 0) {
                logger.warn('No practitioner found for RPPS', { rppsId });
                return null;
            }

            // Parser le premier résultat
            const practitioner = bundle.entry[0].resource;
            const practitionerInfo = this.parseFhirPractitioner(practitioner, rppsId);

            // Obtenir les informations de rôle (pour MSSanté)
            await this.enrichWithPractitionerRole(practitionerInfo);

            // Mettre en cache
            if (this.config.cacheEnabled && practitionerInfo) {
                this.putInCache(rppsId, practitionerInfo);
            }

            logger.info('Practitioner found', {
                rppsId,
                name: `${practitionerInfo.familyName} ${practitionerInfo.givenName}`,
                hasMssante: !!practitionerInfo.mssanteAddress
            });

            return practitionerInfo;

        } catch (error: any) {
            logger.error('Failed to lookup practitioner', {
                rppsId,
                error: error.message
            });

            // En mode simulation, retourner des données mock
            if (process.env.NODE_ENV !== 'production') {
                return this.getMockPractitioner(rppsId);
            }

            return null;
        }
    }

    /**
     * Recherche l'adresse MSSanté d'un praticien par RPPS
     */
    async getMssanteAddress(rppsId: string): Promise<string | null> {
        const practitioner = await this.lookupRpps(rppsId);
        return practitioner?.mssanteAddress || null;
    }

    /**
     * Parse une ressource FHIR Practitioner
     */
    private parseFhirPractitioner(fhirPractitioner: any, rppsId: string): PractitionerInfo {
        const info: PractitionerInfo = {
            rppsId
        };

        // Nom
        const name = fhirPractitioner.name?.[0];
        if (name) {
            info.familyName = name.family;
            info.givenName = name.given?.join(' ');
        }

        // Identifiants
        const identifiers = fhirPractitioner.identifier || [];
        for (const id of identifiers) {
            if (id.system?.includes('1.2.250.1.71.4.2.1')) {
                info.rppsId = id.value;
            }
        }

        // Télécom (chercher MSSanté)
        const telecoms = fhirPractitioner.telecom || [];
        for (const telecom of telecoms) {
            if (telecom.system === 'email') {
                const email = telecom.value?.toLowerCase();
                if (email?.includes('mssante.fr')) {
                    info.mssanteAddress = email;
                } else if (!info.email) {
                    info.email = email;
                }
            } else if (telecom.system === 'phone' && !info.phone) {
                info.phone = telecom.value;
            }
        }

        // Qualifications
        const qualifications = fhirPractitioner.qualification || [];
        info.specialties = qualifications
            .filter((q: any) => q.code?.coding?.[0]?.display)
            .map((q: any) => q.code.coding[0].display);

        return info;
    }

    /**
     * Enrichit avec les informations de PractitionerRole
     */
    private async enrichWithPractitionerRole(info: PractitionerInfo): Promise<void> {
        try {
            const url = `${this.config.baseUrl}/PractitionerRole?practitioner.identifier=${encodeURIComponent(
                `urn:oid:1.2.250.1.71.4.2.1|${info.rppsId}`
            )}`;

            const headers: Record<string, string> = {
                'Accept': 'application/fhir+json'
            };

            if (this.config.apiKey) {
                headers['ESANTE-API-KEY'] = this.config.apiKey;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(this.config.timeout || 10000)
            });

            if (!response.ok) return;

            const bundle = await response.json();

            if (bundle.entry && bundle.entry.length > 0) {
                const role = bundle.entry[0].resource;

                // Télécom du rôle (peut contenir MSSanté pro)
                const telecoms = role.telecom || [];
                for (const telecom of telecoms) {
                    if (telecom.system === 'email') {
                        const email = telecom.value?.toLowerCase();
                        if (email?.includes('mssante.fr') && !info.mssanteAddress) {
                            info.mssanteAddress = email;
                        }
                    }
                }

                // Organisation
                if (role.organization?.display) {
                    info.organization = role.organization.display;
                }

                // Profession/Spécialité
                if (role.code?.[0]?.coding?.[0]?.display) {
                    info.profession = role.code[0].coding[0].display;
                }
            }

        } catch (error: any) {
            logger.warn('Failed to enrich with PractitionerRole', {
                rppsId: info.rppsId,
                error: error.message
            });
        }
    }

    /**
     * Données mock pour simulation
     */
    private getMockPractitioner(rppsId: string): PractitionerInfo {
        logger.info('Returning mock practitioner data (simulation mode)', { rppsId });
        return {
            rppsId,
            familyName: 'MARTIN',
            givenName: 'Sophie',
            profession: 'Médecin généraliste',
            specialties: ['Médecine générale'],
            mssanteAddress: `dr.martin.${rppsId.substring(0, 5)}@medecin.mssante.fr`,
            organization: 'Cabinet Médical Paris',
            phone: '0123456789',
            email: `dr.martin@example.com`
        };
    }

    // ==========================================================================
    // Cache Management
    // ==========================================================================

    private getFromCache(rppsId: string): PractitionerInfo | null {
        const entry = this.cache.get(rppsId);
        if (!entry) return null;

        const now = Date.now();
        if (now - entry.timestamp > (this.config.cacheTtlMs || 86400000)) {
            this.cache.delete(rppsId);
            return null;
        }

        return entry.data;
    }

    private putInCache(rppsId: string, data: PractitionerInfo): void {
        this.cache.set(rppsId, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache(): void {
        this.cache.clear();
        logger.info('Annuaire cache cleared');
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let clientInstance: AnnuaireClient | null = null;

export function getAnnuaireClient(config?: Partial<AnnuaireClientConfig>): AnnuaireClient {
    if (!clientInstance) {
        clientInstance = new AnnuaireClient(config);
    }
    return clientInstance;
}

export default AnnuaireClient;
