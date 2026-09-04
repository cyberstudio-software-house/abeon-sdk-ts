/**
 * One role an organisation can assign, as `GET /api/v1/auth/admin/roles` returns it.
 *
 * Mirrors `schemas/dto/role.json`. It did not: this carried `{name, permissions}` while
 * the schema required `label` and offered `system`, so a consumer typing that response as
 * `Role` lost the two fields the endpoint exists to supply. The schema is pinned against a
 * golden fixture on both sides, and nothing pins the *types* against the schema — which is
 * how the two drifted apart on the day the schema was written.
 */
export interface Role {
    /**
     * Role name within this organisation, e.g. `admin`.
     *
     * Roles are per organisation (ADR-0016): two organisations both have an `admin` and
     * they are different rows with independently editable grants. This is what a JWT's
     * `roles` claim carries and what the assignment endpoint accepts — never a numeric id,
     * which is internal and would let a caller name a row in somebody else's tenant.
     */
    name: string;

    /** Human-readable name for a screen. Null falls back to `name`. */
    label: string | null;

    /**
     * Grants this role confers, in ADR-0001's permission grammar.
     *
     * Descriptive, never authoritative: a client deriving its own authorisation from this
     * would be deriving it from a response rather than from the token (ADR-0010).
     */
    permissions: string[];

    /**
     * True for the roles every organisation is seeded with (`owner`, `admin`, `member`).
     *
     * Advisory — nothing in Auth deletes roles yet, so this is for a screen that wants to
     * stop somebody trying.
     */
    system?: boolean | null;
}
