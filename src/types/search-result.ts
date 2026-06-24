/**
 * A single cross-app search hit (ADR-0011). Returned by the abeon-search
 * service and surfaced as a command-palette result. Mirrors the PHP
 * `Abeon\SDK\DTO\SearchResult` and `schemas/dto/search-result.json`.
 */
export interface SearchResult {
    /** Stable, app-scoped result id, e.g. `crm.contact.42`. */
    id: string;
    /** Primary label shown in the palette row. */
    title: string;
    /** Secondary line, e.g. company or breadcrumb. */
    subtitle: string | null;
    /** Owning app name, e.g. `crm` (matches AppDescriptor.name). */
    source_app: string;
    /** Entity kind within the app, e.g. `contact`. */
    entity_type: string;
    /** Navigation target for the hit. */
    url: string;
    /** Icon name (Lucide) or URL. */
    icon: string | null;
    /** Relevance/ranking hint (higher = closer to top). */
    score: number | null;
}
