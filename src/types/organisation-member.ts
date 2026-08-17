/**
 * One row of an organisation's member list (FR-29).
 *
 * Returned by `GET /api/v1/auth/admin/users` for the organisation in the caller's
 * token — never any other, and the organisation is not a parameter.
 *
 * **Deliberately not a `User`.** `status` here is the status of the *membership*:
 * a person is one account across the platform, and what an organisation admin
 * governs is that person's membership of their own organisation. The same person
 * can be suspended in one organisation and active in another, so a type that
 * reused `User` would make the distinction invisible at every call site — which is
 * where this service's account-takeover bug came from.
 *
 * `id` is the *user's* id. A membership has no id on the wire because it is
 * identified by (user, organisation) and the organisation comes from the token.
 *
 * Mirrors `schemas/dto/organisation-member.json` from abeon/sdk.
 */
export interface OrganisationMember {
    /** The user's id, as a string — ids cross service boundaries as strings. */
    id: string;
    email: string;
    name?: string | null;
    /** Status of the membership in THIS organisation. Never the account's. */
    status: MembershipStatus;
    /** Role names within this organisation. Not permissions — those come from the JWT. */
    roles: string[];
    joined_at?: string | null;
    last_used_at?: string | null;
}

/**
 * `invited` is a membership that exists but has never been used: the person was
 * added and the invitation has not been accepted yet. It is not a suspension and
 * not an active member, and a screen that folds it into either misreports who
 * actually has access.
 */
export type MembershipStatus = 'active' | 'suspended' | 'invited';
