# Public-Key Auth Spec

Status: proposed

This document defines a machine-native authentication model for Monk where:

- `/auth/*` handles tenant bootstrap and auth exchange
- `/api/keys/*` handles tenant-internal key management
- username/password and email are not required for the primary operational path

The goal is to support LLM-first and agent-first products without forcing a human-account model onto routine API use.

This spec adds a machine-native auth path alongside Monk's existing Auth0-backed username/password flows.
It is additive with respect to `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/dissolve*`, and human-account lifecycle routes.

This spec supersedes Monk's existing user-scoped API key surface for machine auth.
It does not treat removal of the tenant-local `credentials` table as equivalent to removing Auth0-backed password login, because production password verification currently lives outside that table.

## Design Goals

- Make autonomous tenant creation possible
- Use public/private keypairs as the root machine credential
- Avoid password storage and password-login ceremony for routine API use
- Keep bootstrap/exchange concerns under `/auth`
- Keep ongoing credential lifecycle management under `/api/keys`
- Preserve a clear separation between:
  - tenant creation
  - proof of key possession
  - short-lived access token issuance
  - key rotation and revocation

## Non-Goals

- This spec does not define a human UI
- This spec does not require email identity
- This spec does not require OAuth or external identity providers
- This spec does not define billing, abuse controls, or tenant quotas, though those remain policy concerns
- This spec does not expose key or challenge state through Monk's generic `/api/data/*` model runtime
- This spec does not redefine Monk's existing human username/password login flow or Auth0 identity mapping behavior

## Compatibility Boundary

This proposal is additive for human auth and replacement-oriented only for machine credentials.

Keep:

- `/auth/register`
- `/auth/login`
- `/auth/refresh`
- `/auth/dissolve`
- `/auth/dissolve/confirm`
- the Auth0-backed username/password login path

Replace over time:

- `/api/user/:id/keys`
- user-scoped API key auth via `X-API-Key` or API-key-shaped bearer tokens

Be careful when narrowing or deleting the tenant-local `credentials` table and related helpers:

- current legacy key routes still depend on it
- non-production local password writes still depend on it
- production Auth0-backed password login does not

The new public-key flow under `/auth/*` and `/api/keys/*` is the target machine credential system in Monk, but it should not be framed as removal of the existing human login path.

## Terminology

- `public_key`: public half of an agent-controlled keypair
- `key_id`: stable server-generated identifier for a stored public key
- `fingerprint`: stable derived fingerprint for display and auditing
- `challenge`: short-lived nonce/payload the client must sign
- `access token`: short-lived Monk bearer token returned by `/auth/verify`

## Endpoint Set

Bootstrap and auth exchange:

- `POST /auth/provision`
- `POST /auth/challenge`
- `POST /auth/verify`

Tenant-internal key management:

- `GET /api/keys`
- `POST /api/keys`
- `POST /api/keys/rotate`
- `DELETE /api/keys/:key_id`

## Key Model

Each tenant may have one or more bound public keys.

Suggested stored fields:

- `id`
- `tenant_id`
- `name`
- `algorithm`
- `public_key`
- `fingerprint`
- `created_at`
- `updated_at`
- `last_used_at`
- `expires_at`
- `revoked_at`
- `permissions` or `scope`

Suggested supported algorithms:

- `ed25519` first
- optionally `ecdsa-p256` later

## Internal Storage Model

The new key system should use tenant-local internal tables that are not registered as Monk models.

Required properties:

- similar in spirit to the existing `users` table in that they are tenant-scoped internal infrastructure
- not inserted into `models`
- not inserted into `fields`
- not accessible through `/api/data/*`
- accessed only through explicit internal SQL/helpers and dedicated auth/key routes

Recommended tables:

### `tenant_keys`

- `id`
- `tenant_id` or equivalent tenant-local ownership link
- `name`
- `algorithm`
- `public_key`
- `fingerprint`
- `scope` or `permissions`
- `created_at`
- `updated_at`
- `last_used_at`
- `expires_at`
- `revoked_at`

### `auth_challenges`

- `id`
- `key_id`
- `nonce`
- `algorithm`
- `issued_at`
- `expires_at`
- `used_at`
- optional minimal audit metadata

## Auth Principal Mapping

Protected Monk routes authorize a concrete tenant-local principal with `user_id`, access level, ACL arrays, and tenant routing resolved by Monk.

Requirements:

- `/auth/verify` must mint a normal Monk bearer token for a concrete tenant-local principal, not a key-only anonymous session
- the first version should bind each tenant key to a tenant-owned service principal or another explicit internal auth principal so current ACL, sudo, auditing, and `System` assumptions remain coherent
- key scopes, if introduced, must reduce or intersect with the bound principal's access; they must not silently exceed it
- audit records should capture both the principal identity and the authenticating `key_id` or fingerprint

## Flow 1: Tenant Provisioning

### `POST /auth/provision`

Purpose:
- Create a new tenant
- Bind its first machine key
- Return the first short-lived auth challenge or first access token

Request:

```json
{
  "tenant": "acme_agent",
  "public_key": "base64-or-pem-encoded-public-key",
  "algorithm": "ed25519",
  "key_name": "builder-1"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "tenant": "acme_agent",
    "tenant_id": "uuid",
    "key": {
      "id": "uuid",
      "name": "builder-1",
      "algorithm": "ed25519",
      "fingerprint": "fp_..."
    },
    "challenge": {
      "challenge_id": "uuid",
      "nonce": "base64url...",
      "expires_in": 300
    }
  }
}
```

Notes:

- Provisioning should not require `username`, `password`, or `email`
- Provisioning must fail if the tenant name is already taken
- Provisioning should store the public key only after validating format and algorithm
- Returning a challenge instead of an immediate bearer token keeps proof-of-possession explicit
- If provisioning creates the tenant before proof-of-possession succeeds, the tenant should remain pending/inactive until first successful `/auth/verify`, or Monk needs explicit cleanup and recovery rules for abandoned provisions

Suggested errors:

- `AUTH_TENANT_MISSING`
- `AUTH_TENANT_INVALID`
- `AUTH_PUBLIC_KEY_MISSING`
- `AUTH_PUBLIC_KEY_INVALID`
- `AUTH_KEY_ALGORITHM_UNSUPPORTED`
- `DATABASE_TENANT_EXISTS`

## Flow 2: Challenge Issuance

### `POST /auth/challenge`

Purpose:
- Ask Monk for a short-lived challenge that must be signed by a tenant-bound private key

Request:

```json
{
  "tenant": "acme_agent",
  "key_id": "uuid"
}
```

Alternative request form:

```json
{
  "tenant": "acme_agent",
  "fingerprint": "fp_..."
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "challenge_id": "uuid",
    "nonce": "base64url...",
    "issued_at": "2026-04-14T00:00:00Z",
    "expires_in": 300,
    "algorithm": "ed25519"
  }
}
```

Requirements:

- Challenge must be short-lived
- Challenge must be single-use if the implementation can support it cleanly
- If true single-use storage is deferred, the replay window must remain tight and documented

Suggested errors:

- `AUTH_TENANT_MISSING`
- `AUTH_KEY_ID_MISSING`
- `AUTH_KEY_NOT_FOUND`
- `AUTH_KEY_REVOKED`
- `AUTH_KEY_EXPIRED`

## Flow 3: Challenge Verification

### `POST /auth/verify`

Purpose:
- Verify proof of possession for a tenant-bound key
- Return a short-lived Monk bearer token

Request:

```json
{
  "tenant": "acme_agent",
  "challenge_id": "uuid",
  "signature": "base64url-signature"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "token": "monk-bearer-token",
    "expires_in": 3600,
    "tenant": "acme_agent",
    "tenant_id": "uuid",
    "key_id": "uuid"
  }
}
```

Requirements:

- The token returned here is the normal Monk protected-route bearer token
- The token should be short-lived
- The token should include tenant routing claims resolved by Monk
- The token should be bound to the authenticated key identity for auditing

Suggested errors:

- `AUTH_CHALLENGE_MISSING`
- `AUTH_CHALLENGE_INVALID`
- `AUTH_CHALLENGE_EXPIRED`
- `AUTH_SIGNATURE_MISSING`
- `AUTH_SIGNATURE_INVALID`
- `AUTH_KEY_NOT_FOUND`
- `AUTH_KEY_REVOKED`

## Flow 4: Key Listing

### `GET /api/keys`

Purpose:
- List machine keys bound to the authenticated tenant

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "builder-1",
      "algorithm": "ed25519",
      "fingerprint": "fp_...",
      "created_at": "2026-04-14T00:00:00Z",
      "last_used_at": "2026-04-14T01:00:00Z",
      "expires_at": null,
      "revoked_at": null
    }
  ]
}
```

Requirements:

- Never return private key material
- Never return challenge state
- This route is authenticated by a valid Monk bearer token obtained from `/auth/verify`
- Listing tenant-wide keys should require root/full access or an explicit key-admin scope, not merely any bearer token in the tenant

## Flow 5: Add Key

### `POST /api/keys`

Purpose:
- Add an additional public key to the current tenant

Request:

```json
{
  "public_key": "base64-or-pem-encoded-public-key",
  "algorithm": "ed25519",
  "name": "runtime-2",
  "expires_at": null
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "runtime-2",
    "algorithm": "ed25519",
    "fingerprint": "fp_...",
    "created_at": "2026-04-14T00:00:00Z",
    "expires_at": null
  }
}
```

Requirements:

- Reject duplicate public keys within the same tenant
- Validate algorithm and key encoding strictly
- Support optional expiry
- Adding tenant-wide keys should require root/full access or an explicit key-admin scope

## Flow 6: Rotate Key

### `POST /api/keys/rotate`

Purpose:
- Replace an existing key with a new key without hard downtime

Request:

```json
{
  "key_id": "uuid",
  "new_public_key": "base64-or-pem-encoded-public-key",
  "algorithm": "ed25519",
  "new_name": "builder-1-rotated",
  "revoke_old_after_seconds": 300
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "old_key_id": "uuid",
    "new_key_id": "uuid",
    "revokes_at": "2026-04-14T00:05:00Z"
  }
}
```

Requirements:

- Rotation should support overlap instead of forcing immediate cutover
- The new key should become valid before the old one is revoked
- Rotation should be auditable
- Rotation should require root/full access or an explicit key-admin scope

## Flow 7: Revoke Key

### `DELETE /api/keys/:key_id`

Purpose:
- Revoke a tenant key

Success response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "revoked": true
  }
}
```

Requirements:

- Revoked keys must no longer receive valid challenges or tokens
- Server should reject revoking the last key only if the product explicitly wants that safety rail
- Otherwise, zero-key tenants are allowed and become temporarily unreachable until reprovisioned through policy-defined means
- Revocation should require root/full access or an explicit key-admin scope

## Token Semantics

The token returned by `/auth/verify` should remain a normal Monk bearer token for protected routes.

Recommended properties:

- short-lived
- tenant-bound
- includes tenant routing claims resolved by Monk
- includes current tenant access data
- includes `key_id` and/or key fingerprint for auditability
- If protected routes do not re-check key status on every request, token TTL must be short enough that revocation latency is bounded by token expiry, and that tradeoff should be explicit

Suggested additional claims:

```json
{
  "auth_type": "public_key",
  "key_id": "uuid",
  "tenant_id": "uuid"
}
```

## Security Requirements

- Public keys are stored; private keys are never transmitted to Monk
- Challenges must expire quickly
- Challenge verification must validate the registered algorithm
- Replay window must be minimized
- Revoked or expired keys must fail closed
- Tenant routing must continue to be resolved by Monk, not trusted from caller input alone
- Key management routes must never expose stored public-key blobs if fingerprint-only display is sufficient for the product
- The new key and challenge tables must not be exposed through Monk's generic data/model APIs

## Migration Notes

This plan is additive for human auth and replacement-oriented only for legacy machine API keys.

Recommended migration shape:

1. Keep current Auth0-backed human auth surfaces in place:
   - `/auth/register`
   - `/auth/login`
   - `/auth/refresh`
   - `/auth/dissolve`
   - `/auth/dissolve/confirm`
   - `/api/user/:id/password` unless a separate policy removes it
2. Add internal tenant tables for:
   - public key registry
   - auth challenge state
   - principal-to-key bindings or equivalent internal auth mapping
3. Add:
   - `/auth/provision`
   - `/auth/challenge`
   - `/auth/verify`
   - `/api/keys*`
4. Define how a verified key maps to a tenant-local principal so protected Monk bearer tokens continue to carry user/access/ACL context
5. Migrate machine clients off:
   - `/api/user/:id/keys`
   - current user-scoped API key auth support
6. After machine clients are migrated, remove legacy API-key surfaces and any tenant-local credential storage used only for machine auth
7. Decide separately whether any remaining local password credential writes survive outside development/test, but do not treat that decision as the same question as keeping Auth0-backed username/password login

## Open Questions

- Should `/auth/provision` return a challenge or directly return a first short-lived bearer token?
- Should key scopes live on `/api/keys` from day one, or should the first version stay tenant-wide?
- Should challenge state be persisted for strict single-use semantics, or should the first version accept a short replay window?
- Should a tenant be allowed to have zero active keys, or should the last-key deletion be blocked?
- Should Monk expose raw public keys on `GET /api/keys`, or only fingerprints and metadata?
- Should verified keys map to dedicated service users or to a separate internal principal type?
- Should `/auth/provision` leave tenants pending until first successful `/auth/verify`, or activate them immediately with a cleanup TTL for abandoned bootstrap attempts?
- Should tenant-wide key management require root/full only, or should Monk support a narrower key-admin scope?
- How should existing tenant schemas be migrated if they already contain the old `credentials` table?
