/**
 * Notification DTO — shape served by Notifications service to the Topbar bell.
 * Aligned with arch doc 5A.4.
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
