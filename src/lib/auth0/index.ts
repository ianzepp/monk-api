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
