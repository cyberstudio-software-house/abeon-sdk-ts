/**
 * Notification DTO — shape served by AbeonUnified to the Topbar bell.
 * Schema: `schemas/dto/notification.json` (ADR-0006).
 */
export interface NotificationDto {
    id: string;
    user_id: number;
    type: string;
    title: string;
    body: string;
    icon: string | null;
    action_url: string | null;
    source_app: string;
    read_at: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
}

/** Where a notification is delivered (ADR-0028). `in_app` is always one of them. */
export type NotificationChannel = 'in_app' | 'email';

/** Channels a user can switch off. `in_app` is not one: the feed is the record. */
export interface NotificationPreferenceChannels {
    email?: boolean;
}

/** One rule: a notification `type`, or `*` for every type without its own rule. */
export interface NotificationPreference {
    type: string;
    channels: NotificationPreferenceChannels;
}

/** Schema: `schemas/dto/notification-preferences.json` (ADR-0028). */
export interface NotificationPreferences {
    preferences: NotificationPreference[];
}
