/**
 * RFC 7807 Problem Details — wire format for `application/problem+json` errors.
 *
 * Extension members (anything beyond the five spec fields) are accessible
 * via index signature. Common extensions include `errors` (field-level
 * validation errors for status 422).
 */
export interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail?: string | null;
    instance?: string | null;
    /** Field-level validation errors, typically for HTTP 422. */
    errors?: Record<string, string[]>;
    /** Arbitrary RFC 7807 extension members. */
    [extension: string]: unknown;
}
