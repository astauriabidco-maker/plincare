# Pro Santé Connect - Documentation Technique

## 1. Vue d'Ensemble

Pro Santé Connect (PSC) est le service d'authentification fédéré pour les professionnels de santé en France, basé sur OpenID Connect.

### 1.1 Objectifs

- **Authentification forte** des professionnels de santé
- **Vérification d'identité** via RPPS/ADELI
- **Récupération des attributs** sectoriels (profession, spécialité)
- **Conformité Ségur** pour l'accès aux données de santé

### 1.2 Fournisseur

| Information | Valeur |
|-------------|--------|
| **Éditeur** | ANS (Agence du Numérique en Santé) |
| **Standard** | OpenID Connect 1.0 |
| **URL Production** | `https://auth.esante.gouv.fr` |
| **URL Bac à sable** | `https://auth.bas.esante.gouv.fr` |

---

## 2. Cinématique OpenID Connect

### 2.1 Flux Authorization Code

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   PFI    │     │   PSC    │     │   CPS    │
│  (Web)   │     │ Gateway  │     │  Server  │     │  e-CPS   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  1. Accès API  │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │  2. Redirect   │                │                │
     │◀───────────────│                │                │
     │         302 → /authorize        │                │
     │                │                │                │
     │  3. Auth Request               │                │
     │────────────────────────────────▶│                │
     │                │                │                │
     │  4. Login Page │                │                │
     │◀────────────────────────────────│                │
     │                │                │                │
     │  5. Auth (CPS/e-CPS)            │                │
     │─────────────────────────────────────────────────▶│
     │                │                │                │
     │  6. Validation │                │                │
     │◀─────────────────────────────────────────────────│
     │                │                │                │
     │  7. Callback avec code          │                │
     │─────────────────────────────────▶                │
     │                │                │                │
     │                │  8. Token Request               │
     │                │───────────────▶│                │
     │                │                │                │
     │                │  9. Access + ID Token           │
     │                │◀───────────────│                │
     │                │                │                │
     │                │ 10. UserInfo   │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 11. Claims     │                │
     │                │◀───────────────│                │
     │                │                │                │
     │ 12. Réponse API (avec JWT)      │                │
     │◀───────────────│                │                │
     │                │                │                │
```

---

## 3. Configuration PFI

### 3.1 Variables d'Environnement

```bash
# Pro Santé Connect - Production
PSC_ISSUER=https://auth.esante.gouv.fr/auth/realms/esante-wallet
PSC_CLIENT_ID=pfi-gateway-prod
PSC_CLIENT_SECRET=${PSC_CLIENT_SECRET}  # Secret Vault
PSC_REDIRECT_URI=https://pfi.example.com/auth/callback
PSC_SCOPES=openid profile scope_all

# Pro Santé Connect - Bac à sable
PSC_ISSUER_SANDBOX=https://auth.bas.esante.gouv.fr/auth/realms/esante-wallet
PSC_CLIENT_ID_SANDBOX=pfi-gateway-test
```

### 3.2 Endpoints OpenID Connect

| Endpoint | URL |
|----------|-----|
| **Authorization** | `{issuer}/protocol/openid-connect/auth` |
| **Token** | `{issuer}/protocol/openid-connect/token` |
| **UserInfo** | `{issuer}/protocol/openid-connect/userinfo` |
| **JWKS** | `{issuer}/protocol/openid-connect/certs` |
| **End Session** | `{issuer}/protocol/openid-connect/logout` |

---

## 4. Implémentation Gateway

### 4.1 Middleware d'Authentification

```typescript
// apps/gateway/src/middleware/psc-auth.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const PSC_ISSUER = process.env.PSC_ISSUER;
const PSC_AUDIENCE = process.env.PSC_CLIENT_ID;

// Client JWKS pour validation des tokens
const client = jwksClient({
    jwksUri: `${PSC_ISSUER}/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxAge: 86400000 // 24h
});

// Récupération de la clé publique
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key?.getPublicKey();
        callback(null, signingKey);
    });
}

// Middleware de validation
export async function validatePscToken(
    req: Request, 
    res: Response, 
    next: NextFunction
) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Bearer token required'
        });
    }
    
    const token = authHeader.substring(7);
    
    jwt.verify(token, getKey, {
        issuer: PSC_ISSUER,
        audience: PSC_AUDIENCE,
        algorithms: ['RS256']
    }, (err, decoded) => {
        if (err) {
            return res.status(401).json({
                error: 'invalid_token',
                message: err.message
            });
        }
        
        // Attacher les claims au request
        req.user = decoded as PscUserClaims;
        next();
    });
}
```

### 4.2 Claims Utilisateur

```typescript
// Types pour les claims PSC
interface PscUserClaims {
    sub: string;              // Identifiant unique
    given_name: string;       // Prénom
    family_name: string;      // Nom
    
    // Claims sectoriels
    SubjectRefPro: {
        codeCivilite: string;
        exercices: Array<{
            codeProfession: string;
            codeCategorieProfessionnelle: string;
            codeSavoirFaire: string;
            activities: Array<{
                raisonSocialeSite: string;
                numFiness: string;
            }>;
        }>;
    };
    
    // Identifiants nationaux
    SubjectNameID: string;    // RPPS ou ADELI
}
```

---

## 5. Scopes et Permissions

### 5.1 Scopes Disponibles

| Scope | Description | Claims Retournés |
|-------|-------------|------------------|
| `openid` | Obligatoire pour OIDC | `sub` |
| `profile` | Identité de base | `given_name`, `family_name` |
| `scope_all` | Attributs sectoriels | `SubjectRefPro`, `SubjectNameID` |

### 5.2 Mapping vers Scopes FHIR

```typescript
// Conversion PSC → SMART-on-FHIR
function mapPscToFhirScopes(pscClaims: PscUserClaims): string[] {
    const scopes: string[] = [];
    
    // Tous les PS ont accès en lecture
    scopes.push('patient/*.read');
    
    // Médecins peuvent écrire
    if (pscClaims.SubjectRefPro?.exercices?.some(
        e => e.codeProfession === '10'  // Médecin
    )) {
        scopes.push('patient/*.write');
        scopes.push('patient/Appointment.write');
    }
    
    // Biologistes peuvent créer des observations
    if (pscClaims.SubjectRefPro?.exercices?.some(
        e => e.codeProfession === '21'  // Biologiste
    )) {
        scopes.push('patient/Observation.write');
        scopes.push('patient/DiagnosticReport.write');
    }
    
    return scopes;
}
```

---

## 6. Intégration avec Cartes CPS/e-CPS

### 6.1 Méthodes d'Authentification

| Méthode | Description | Usage |
|---------|-------------|-------|
| **CPS physique** | Carte à puce + code PIN | Postes fixes |
| **e-CPS** | Application mobile | Mobilité, téléconsultation |
| **Certificat logiciel** | Certificat IGC Santé | Applications serveur |

### 6.2 Hiérarchie de Confiance

```
┌─────────────────────────────────────────┐
│          IGC Santé (ANS)                │
│     Autorité de Certification Racine    │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌───────┐   ┌───────────┐   ┌───────────┐
│  CPS  │   │   e-CPS   │   │   Cert    │
│       │   │           │   │  Logiciel │
└───────┘   └───────────┘   └───────────┘
```

---

## 7. Gestion des Sessions

### 7.1 Durée de Vie des Tokens

| Token | Durée | Renouvellement |
|-------|-------|----------------|
| Access Token | 5 minutes | Automatique via Refresh |
| Refresh Token | 30 minutes | Jusqu'à expiration |
| ID Token | 5 minutes | Non renouvelable |

### 7.2 Déconnexion (Logout)

```typescript
// Logout avec révocation PSC
async function logout(req: Request, res: Response) {
    const idToken = req.session.idToken;
    const redirectUri = encodeURIComponent('https://pfi.example.com');
    
    // Révoquer le token côté PSC
    const logoutUrl = `${PSC_ISSUER}/protocol/openid-connect/logout` +
        `?id_token_hint=${idToken}` +
        `&post_logout_redirect_uri=${redirectUri}`;
    
    // Détruire la session locale
    req.session.destroy();
    
    res.redirect(logoutUrl);
}
```

---

## 8. Sécurité

### 8.1 Recommandations

| Mesure | Implémentation |
|--------|----------------|
| PKCE | Obligatoire (code_verifier) |
| State | Anti-CSRF (UUID aléatoire) |
| Nonce | Anti-replay (dans ID Token) |
| HTTPS | TLS 1.3 uniquement |
| Token Storage | Serveur uniquement (pas de localStorage) |

### 8.2 Validation des Tokens

```typescript
// Checklist de validation
const validationChecks = [
    'Signature RS256 valide (JWKS)',
    'Issuer = PSC_ISSUER',
    'Audience = CLIENT_ID',
    'exp > now (non expiré)',
    'iat < now (émis dans le passé)',
    'nonce = session.nonce (si présent)'
];
```

---

## 9. Audit et Traçabilité

### 9.1 Logs d'Authentification

```json
{
  "timestamp": "2026-01-29T11:00:00.000Z",
  "event": "PSC_LOGIN_SUCCESS",
  "actor": {
    "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "rpps": "10101010101",
    "name": "Dr Sophie MARTIN"
  },
  "details": {
    "auth_method": "e-CPS",
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "session_id": "sess_xxx"
  }
}
```

### 9.2 Événements Audités

| Événement | Description |
|-----------|-------------|
| `PSC_LOGIN_SUCCESS` | Connexion réussie |
| `PSC_LOGIN_FAILURE` | Échec d'authentification |
| `PSC_TOKEN_REFRESH` | Renouvellement de token |
| `PSC_LOGOUT` | Déconnexion |
| `PSC_ACCESS_DENIED` | Accès refusé (scope insuffisant) |

---

## 10. Références

- [Documentation Pro Santé Connect (ANS)](https://industriels.esante.gouv.fr/produits-et-services/pro-sante-connect)
- [Spécifications OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html)
- [IGC Santé - Politique de Certification](https://esante.gouv.fr/securite/igc-sante)
