/**
 * Who triggered an event. Stored under `actor` in the event envelope.
 */
export type ActorType = 'user' | 'service' | 'system';

export interface Actor {
    type: ActorType;
    user_id?: string;
    service_name?: string;
}
