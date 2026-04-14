# POST /auth/provision

Provision a pending tenant, its first tenant-local user, and the first bound public key.

This route is the machine-native bootstrap path. It returns a signing challenge instead of a Monk bearer token.
