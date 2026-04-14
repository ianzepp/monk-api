# Keys API

The Keys API manages tenant-bound machine credentials after bootstrap.

All routes require a valid Monk bearer token and root/full tenant access.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/keys` | List tenant keys with fingerprint-first metadata |
| POST | `/api/keys` | Add a public key bound to a tenant-local user |
| POST | `/api/keys/rotate` | Rotate a key with an overlap window |
| DELETE | `/api/keys/:key_id` | Revoke a tenant key |
