import { useContext } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import { AbeonContext } from './context.js';

/**
 * Get the shared API client instance from `<AbeonProvider>`. Throws when
 * used outside the provider.
 *
 *     function ContactList() {
 *         const api = useApi();
 *         const [contacts, setContacts] = useState<Contact[]>([]);
 *         useEffect(() => {
 *             api.get<{ data: Contact[] }>('/api/v1/contacts').then((r) => setContacts(r.data));
 *         }, [api]);
 *         // ...
 *     }
 */
export function useApi(): ApiClient {
    const ctx = useContext(AbeonContext);
    if (!ctx) {
        throw new Error(
            '@abeon/sdk-ts/react: useApi() must be used inside <AbeonProvider>',
        );
    }
    return ctx.apiClient;
}
