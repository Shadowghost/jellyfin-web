import type { SystemApiGetLogEntriesRequest } from '@jellyfin/sdk/lib/generated-client/api/system-api';
import type { AxiosRequestConfig } from 'axios';
import type { Api } from '@jellyfin/sdk';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

export const ACTIVITY_PAGE_SIZE = 25;

const fetchLogEntries = async (
    api: Api,
    requestParams?: SystemApiGetLogEntriesRequest,
    options?: AxiosRequestConfig
) => {
    const response = await getSystemApi(api).getLogEntries(requestParams, {
        signal: options?.signal
    });

    return response.data;
};

export const useLogEntries = (
    requestParams: SystemApiGetLogEntriesRequest
) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['ActivityLogEntries', requestParams],
        queryFn: ({ signal }) =>
            fetchLogEntries(api!, requestParams, { signal }),
        enabled: !!api,
        refetchOnMount: false,
        staleTime: 0 // ensure we load the latest log entries
    });
};

/**
 * Paginates log entries for an infinite-scrolling list. `requestParams` should hold the filters and
 * sorting only; startIndex/limit are managed per page.
 */
export const useInfiniteLogEntries = (
    requestParams: SystemApiGetLogEntriesRequest
) => {
    const { api } = useApi();
    return useInfiniteQuery({
        queryKey: ['ActivityLogEntries', 'infinite', requestParams],
        queryFn: ({ pageParam, signal }) =>
            fetchLogEntries(
                api!,
                { ...requestParams, startIndex: pageParam * ACTIVITY_PAGE_SIZE, limit: ACTIVITY_PAGE_SIZE },
                { signal }
            ),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const loaded = allPages.reduce((total, page) => total + (page.Items?.length ?? 0), 0);
            return loaded < (lastPage.TotalRecordCount ?? 0) ? allPages.length : undefined;
        },
        enabled: !!api
    });
};
