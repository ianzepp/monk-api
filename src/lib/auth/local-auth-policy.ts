import { HttpErrors } from '@src/lib/errors/http-error.js';

const LOCAL_AUTH_FLAG = 'MONK_ENABLE_LOCAL_AUTH';

export function isLocalAuthEnabled(): boolean {
    return process.env.NODE_ENV !== 'production' && process.env[LOCAL_AUTH_FLAG] === 'true';
}

export function assertLocalAuthEnabled(operation: string): void {
    if (isLocalAuthEnabled()) {
        return;
    }

    throw HttpErrors.forbidden(
        `${operation} is disabled. Auth0/OIDC is the production authentication authority.`,
        'LOCAL_AUTH_DISABLED'
    );
}

export function localAuthFlagName(): string {
    return LOCAL_AUTH_FLAG;
}
