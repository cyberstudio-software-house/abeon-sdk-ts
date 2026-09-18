/**
 * Transactional message — an invitation, a password reset, an address verification
 * (ADR-0030). Not a notification: preferences do not apply and the recipient may have
 * no account.
 */
export type MessageLocale = 'pl' | 'en';

export type MessageStatus = 'queued' | 'sent' | 'failed' | 'suppressed';

/** Schema: `schemas/dto/message.json`. */
export interface MessageDto {
    id: string;
    template: string;
    to_email: string;
    locale?: MessageLocale;
    status: MessageStatus;
    error?: string | null;
    created_at: string;
    sent_at?: string | null;
}

/** Schema: `schemas/events/message-requested.json`. Published by services, not by browsers. */
export interface MessageRequestedPayload {
    template: string;
    to: { email: string; name?: string | null; user_id?: number | null };
    locale?: MessageLocale;
    data?: Record<string, unknown>;
    idempotency_key: string;
}
