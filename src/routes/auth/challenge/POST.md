# POST /auth/challenge

Request a short-lived single-use challenge for a tenant-bound public key.

Clients sign the returned `nonce` with the matching private key and submit that signature to `POST /auth/verify`.
