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

Strip out before starting new public-key feature work:

- `/api/user/:id/keys`
- user-scoped API key auth via `X-API-Key` or API-key-shaped bearer tokens

Be careful when narrowing or deleting the tenant-local `credentials` table and related helpers:

- current legacy key routes still depend on it
- production Auth0-backed password login does not

The new public-key flow under `/auth/*` and `/api/keys/*` is the target machine credential system in Monk, but it should not be framed as removal of the existing human login path.
Legacy machine-auth surfaces are intentionally not preserved as a compatibility bridge in this plan.

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
- `user_id`
- `name`
- `algorithm`
- `public_key`
- `fingerprint`
- `created_at`
- `updated_at`
- `last_used_at`
- `expires_at`
- `revoked_at`

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
- `user_id`
- `name`
- `algorithm`
- `public_key`
- `fingerprint`
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
- each key should bind to a concrete tenant-local user
- the first version should stay tenant-wide at the key layer; access control should come from the mapped user's access level and ACL context rather than an extra per-key scope model
- audit records should capture both the principal identity and the authenticating `key_id` or fingerprint

## Flow 1: Tenant Provisioning

### `POST /auth/provision`

Purpose:
- Create a new tenant
- Create its first tenant-local user
- Bind its first machine key to that user
- Return the first auth challenge instead of a Monk bearer token

Request:

```json
{
  "tenant": "acme_agent",
  "username": "root_agent",
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
    "user": {
      "id": "uuid",
      "username": "root_agent",
      "access": "root"
    },
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

- Provisioning should require `tenant`, `username`, and the first `public_key`, but not `password` or `email`
- Provisioning must fail if the tenant name is already taken
- Provisioning should store the public key only after validating format and algorithm
- Provisioning should create the first tenant-local user and bind the first key to that user
- The first provisioned user should be the tenant bootstrap root/full principal unless the product later introduces a different bootstrap role
- Provisioning should return a challenge instead of minting a Monk JWT before proof-of-possession is demonstrated

Suggested errors:

- `AUTH_TENANT_MISSING`
- `AUTH_TENANT_INVALID`
- `AUTH_USERNAME_MISSING`
- `AUTH_USERNAME_INVALID`
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
      "user_id": "uuid",
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
- Listing tenant-wide keys should require root/full access

## Flow 5: Add Key

### `POST /api/keys`

Purpose:
- Add an additional public key bound to a specific user in the current tenant

Request:

```json
{
  "user_id": "uuid",
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
    "user_id": "uuid",
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
- Require an explicit target `user_id` so every key remains bound to a concrete user
- Adding tenant-wide keys should require root/full access

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
- Rotation should require root/full access

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
- Server should reject revoking the last key unless the tenant still has a mapped username/password login path available
- Zero-key tenants are allowed only when a mapped user/password path still exists
- Revocation should require root/full access

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
Because the legacy key path is not the live protected-route auth mechanism anymore, the spec prefers deleting that overlap first instead of carrying two machine-auth stories during implementation.

Recommended migration shape:

1. Keep current Auth0-backed human auth surfaces in place:
   - `/auth/register`
   - `/auth/login`
   - `/auth/refresh`
   - `/auth/dissolve`
   - `/auth/dissolve/confirm`
2. Strip out legacy machine-auth surfaces that are no longer part of the live auth path:
   - `/api/user/:id/keys`
   - `/api/user/:id/password`
   - any deprecated API-key auth acceptance path or docs implying API-key login support
   - machine-auth-only `credentials` helpers and route plumbing
3. Add internal tenant tables for:
   - public key registry
   - auth challenge state
   - principal-to-key bindings or equivalent internal auth mapping
4. Define and implement how a verified key maps to a tenant-local principal so protected Monk bearer tokens continue to carry user/access/ACL context
5. Add the bootstrap and exchange flow:
   - `/auth/provision`
   - `/auth/challenge`
   - `/auth/verify`
6. Add tenant key management:
   - `/api/keys*`
7. Migrate machine clients onto the new public-key flow
8. Remove any remaining tenant-local credential storage used only for legacy machine auth

## Open Questions

- Should challenge state be persisted for strict single-use semantics, or should the first version accept a short replay window?
- Should `GET /api/keys` return the stored public key material, or only fingerprints and metadata?
- If `/auth/provision` returns a challenge before first successful `/auth/verify`, should the tenant remain pending/inactive until verification succeeds, or should Monk activate it immediately with cleanup for abandoned bootstrap attempts?
- For tenants that already have the old `credentials` table, should migration drop it immediately, leave it inert until later cleanup, or transform any of its rows into the new internal key structures?
