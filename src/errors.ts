import type { ProblemDetails } from './types/problem-details.js';

/**
 * Base error class — wraps an RFC 7807 ProblemDetails.
 *
 * Mirrors `Abeon\SDK\Exceptions\AbeonException` from abeon/sdk (PHP).
 * Thrown by the API client when an upstream returns `application/problem+json`,
 * or constructed manually for client-side contract violations.
 *
 *     try {
 *         await api.get('/contacts/42');
 *     } catch (err) {
 *         if (err instanceof AbeonError) {
 *             if (err.problem.status === 404) { ... }
 *         }
 *     }
 */
export class AbeonError extends Error {
    public readonly problem: ProblemDetails;

    constructor(problem: ProblemDetails) {
        super(problem.detail ?? problem.title);
        this.name = 'AbeonError';
        this.problem = problem;
        // Preserve stack across transpilation targets.
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    get status(): number {
        return this.problem.status;
    }

    get type(): string {
        return this.problem.type;
    }
}

export class AuthError extends AbeonError {
    constructor(problem: ProblemDetails) {
        super(problem);
        this.name = 'AuthError';
    }

    static unauthenticated(reason = 'Missing or invalid credentials'): AuthError {
        return new AuthError({
            type: 'https://api.abeon.pl/errors/unauthenticated',
            title: 'Unauthenticated',
            status: 401,
            detail: reason,
        });
    }

    static forbidden(reason = 'Insufficient permissions'): AuthError {
        return new AuthError({
            type: 'https://api.abeon.pl/errors/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: reason,
        });
    }
}

export class ContractViolationError extends AbeonError {
    constructor(problem: ProblemDetails) {
        super(problem);
        this.name = 'ContractViolationError';
    }

    static unknownService(name: string): ContractViolationError {
        return new ContractViolationError({
            type: 'https://api.abeon.pl/errors/contract-violation',
            title: 'Unknown service',
            status: 500,
            detail: `Service '${name}' is not configured.`,
        });
    }

    static invalidRoutingKey(key: string): ContractViolationError {
        return new ContractViolationError({
            type: 'https://api.abeon.pl/errors/contract-violation',
            title: 'Invalid event routing key',
            status: 500,
            detail: `Routing key '${key}' does not match the {service}.{entity}.{action} grammar.`,
        });
    }
}

/**
 * Type guard — returns true if value is an RFC 7807 ProblemDetails JSON body.
 * Use after `response.json()` to decide whether to wrap as AbeonError.
 */
export function isProblemDetails(value: unknown): value is ProblemDetails {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const v = value as Record<string, unknown>;
    return (
        typeof v.type === 'string' &&
        typeof v.title === 'string' &&
        typeof v.status === 'number'
    );
}
