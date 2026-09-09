import type { Api } from '@jellyfin/sdk';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

import type { HeroOptions } from 'apps/dashboard/features/hero/types/heroOptions';
import { useApi } from 'hooks/useApi';

export const QUERY_KEY = 'HeroOptions';
export const HERO_CONFIG_KEY = 'hero';

const fetchHeroOptions = async (
    api: Api,
    options?: AxiosRequestConfig
) => {
    return getSystemApi(api)
        // The endpoint is declared as producing a file, so the generated client mistypes the body.
        .getNamedConfiguration({ key: HERO_CONFIG_KEY }, options)
        .then(({ data }) => data as unknown as HeroOptions);
};

export const getHeroOptionsQuery = (
    api?: Api
) => queryOptions({
    queryKey: [ QUERY_KEY ],
    queryFn: ({ signal }) => fetchHeroOptions(api!, { signal }),
    enabled: !!api
});

export const useHeroOptions = () => {
    const { api } = useApi();
    return useQuery(getHeroOptionsQuery(api));
};
