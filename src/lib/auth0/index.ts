export {
    AUTH0_DEFAULT_ALGORITHM,
    Auth0ConfigError,
    auth0ConfigFromEnv,
    type Auth0Config,
    type Auth0ConfigEnv,
} from './config.js';

export {
    Auth0VerificationError,
    Auth0Verifier,
    verifyAuth0AccessToken,
    type Auth0VerifierOptions,
    type VerifiedAuth0Identity,
} from './verifier.js';

export {
    Auth0IdentityMappingError,
    auth0UserAuthValue,
    createAuth0IdentityMapping,
    getAuth0IdentityMapping,
    resolveAuth0Identity,
    type Auth0IdentityMapping,
    type CreateAuth0IdentityMappingInput,
    type ResolvedAuth0Identity,
} from './identity-mapping.js';
