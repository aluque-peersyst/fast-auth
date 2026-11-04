export enum ConsoleAdminErrors {
    VALIDATION_FAILED = "validationFailed",
    DAPP_NOT_FOUND = "dappNotFound",
    INVALID_TRANSITION = "invalidTransition",
    NO_PENDING_CHANGE = "noPendingChange",
    DAPP_CHANGED = "dappChanged",
    OWNER_ALREADY_HAS_DAPP = "ownerAlreadyHasDapp",
    PROVISIONING_REJECTED = "adminProvisioningRejected",
    PROVISIONING_FAILED = "adminProvisioningFailed",
    SETTINGS_CHANGED = "settingsChanged",
    RATE_LIMITED = "rateLimited",
    SESSION_EXPIRED = "sessionExpired",
    EMAIL_REQUIRED = "emailRequired",
    EMAIL_NOT_VERIFIED = "emailNotVerified",
    FORBIDDEN_ROLE = "forbiddenRole",
    SERVER_ERROR = "serverError",
    CONSOLE_UNREACHABLE = "consoleUnreachable",
}

/**
 * The domain error of each code the console's admin endpoints answer with, then of the statuses that come without one.
 * Auth0 failures point an admin to the error the dApp stores, which the owner never sees.
 */
export const CONSOLE_ADMIN_API_ERRORS: Record<string, ConsoleAdminErrors> = {
    DAPP_NOT_FOUND: ConsoleAdminErrors.DAPP_NOT_FOUND,
    DAPP_ALREADY_EXISTS: ConsoleAdminErrors.OWNER_ALREADY_HAS_DAPP,
    INVALID_TRANSITION: ConsoleAdminErrors.INVALID_TRANSITION,
    NO_PENDING_CHANGE: ConsoleAdminErrors.NO_PENDING_CHANGE,
    DAPP_CHANGED: ConsoleAdminErrors.DAPP_CHANGED,
    PROVISIONING_REJECTED: ConsoleAdminErrors.PROVISIONING_REJECTED,
    PROVISIONING_FAILED: ConsoleAdminErrors.PROVISIONING_FAILED,
    SETTINGS_CHANGED: ConsoleAdminErrors.SETTINGS_CHANGED,
    RATE_LIMITED: ConsoleAdminErrors.RATE_LIMITED,
    UNAUTHENTICATED: ConsoleAdminErrors.SESSION_EXPIRED,
    EMAIL_REQUIRED: ConsoleAdminErrors.EMAIL_REQUIRED,
    EMAIL_NOT_VERIFIED: ConsoleAdminErrors.EMAIL_NOT_VERIFIED,
    FORBIDDEN_ROLE: ConsoleAdminErrors.FORBIDDEN_ROLE,
    INTERNAL: ConsoleAdminErrors.SERVER_ERROR,
    401: ConsoleAdminErrors.SESSION_EXPIRED,
    500: ConsoleAdminErrors.SERVER_ERROR,
};

/**
 * A dApp the admin opened by an id that names no dApp, or is not one.
 */
export const CONSOLE_ADMIN_GET_DAPP_ERRORS: Record<string, ConsoleAdminErrors> = {
    ...CONSOLE_ADMIN_API_ERRORS,
    400: ConsoleAdminErrors.DAPP_NOT_FOUND,
    404: ConsoleAdminErrors.DAPP_NOT_FOUND,
};
