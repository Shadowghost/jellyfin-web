import { useMemo } from 'react';

import { useCultures } from 'apps/dashboard/features/libraries/api/useCultures';

/**
 * Returns a resolver mapping a stream language code (2- or 3-letter ISO) to its full display name
 * (e.g. "eng" -> "English"), using the server's culture list. Falls back to the raw code.
 */
const useLanguageName = () => {
    const { data: cultures } = useCultures();

    return useMemo(() => {
        const map = new Map<string, string>();
        (cultures ?? []).forEach(culture => {
            const name = culture.DisplayName;
            if (!name) {
                return;
            }
            [
                culture.TwoLetterISOLanguageName,
                culture.ThreeLetterISOLanguageName,
                ...(culture.ThreeLetterISOLanguageNames ?? [])
            ].forEach(code => {
                if (code) {
                    map.set(code.toLowerCase(), name);
                }
            });
        });

        return (code?: string | null): string | undefined => (
            code ? (map.get(code.toLowerCase()) ?? code) : undefined
        );
    }, [ cultures ]);
};

export default useLanguageName;
