# POST /auth/verify

Verify proof of possession for a tenant-bound key and mint a short-lived Monk bearer token.

Successful verification promotes a `pending` tenant to `active` on first proof.
