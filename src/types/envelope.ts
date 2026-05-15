import type { Actor } from './actor.js';

/**
 * Event envelope on RabbitMQ exchange `abeon.events`.
 * Mirrors `schemas/events/_envelope.json` from abeon/sdk.
 *
 * Per-event payload schemas (the shape of `data`) live in each owning
 * service's repository and are typed via `@abeon/{service}-events`
 * npm packages (federated, M2/M3 — see Phase 0 plans).
 *
 *     type ContactCreatedEnvelope = EventEnvelope<{ contact_id: number; email: string }>;
 */
export interface EventEnvelope<TData = Record<string, unknown>> {
    event_id: string;
    event_type: string;
    timestamp: string;
    source: string;
    version: string;
    actor: Actor;
    data: TData;
    metadata: EventMetadata;
}

export interface EventMetadata {
    correlation_id?: string;
    causation_id?: string | null;
    /** Forward-compat slot for W3C Trace Context (added with OTEL in v0.3). */
    trace?: {
        traceparent?: string;
        tracestate?: string;
    };
    [extension: string]: unknown;
}

/**
 * Routing key grammar enforced by abeon/sdk: `{service}.{entity}.{action}`.
 */
export const ROUTING_KEY_REGEX = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
