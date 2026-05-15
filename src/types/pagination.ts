/**
 * Pagination metadata returned alongside paginated collections.
 * Keys match Laravel `LengthAwarePaginator` output.
 */
export interface Pagination {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
}

/**
 * Generic envelope for paginated responses.
 *
 *     const response: PaginatedResponse<Contact> = await api.get('/contacts');
 *     response.data.forEach(...);
 *     response.meta.total;
 */
export interface PaginatedResponse<T> {
    data: T[];
    meta: Pagination;
}
