import type { Api } from '@jellyfin/sdk';
import { PlaybackHistoryApi } from '@jellyfin/sdk/lib/generated-client/api/playback-history-api';
import { PlaybackStatsInterval } from '@jellyfin/sdk/lib/generated-client/models/playback-stats-interval';
import type {
    NameCountDto,
    PlaybackHistoryDto,
    PlaybackStatsContextBreakdownDto,
    PlaybackStatsHeatmapEntryDto,
    PlaybackStatsItemDto,
    PlaybackStatsStreamBreakdownDto,
    PlaybackStatsSummaryDto,
    PlaybackStatsTimelineEntryDto,
    PlaybackStatsUserDto
} from '@jellyfin/sdk/lib/generated-client/models';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

export interface StatsParams {
    startDate?: string;
    endDate?: string;
    userId?: string;
    mediaType?: string;
}

// Re-export the generated SDK types/enum so consumers have a single import site.
export { PlaybackStatsInterval };
export type {
    NameCountDto,
    PlaybackHistoryDto,
    PlaybackStatsContextBreakdownDto,
    PlaybackStatsHeatmapEntryDto,
    PlaybackStatsItemDto,
    PlaybackStatsStreamBreakdownDto,
    PlaybackStatsSummaryDto,
    PlaybackStatsTimelineEntryDto,
    PlaybackStatsUserDto
};

const getPlaybackHistoryApi = (api: Api) => new PlaybackHistoryApi(api.configuration, undefined, api.axiosInstance);

export const useStatsSummary = (params: StatsParams) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Summary', params],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsSummary(params, { signal })).data,
        enabled: !!api
    });
};

export const useStatsTimeline = (params: StatsParams, interval: PlaybackStatsInterval) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Timeline', params, interval],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsTimeline({ ...params, interval }, { signal })).data,
        enabled: !!api
    });
};

export interface PageSort {
    sortBy?: string;
    descending: boolean;
    startIndex: number;
    limit: number;
}

export const useTopItems = (params: StatsParams, opts: PageSort) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'TopItems', params, opts],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsTopItems({ ...params, ...opts }, { signal })).data,
        enabled: !!api
    });
};

export const useUserStats = (params: Pick<StatsParams, 'startDate' | 'endDate' | 'mediaType'>, opts: PageSort) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Users', params, opts],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsUsers({ ...params, ...opts }, { signal })).data,
        enabled: !!api
    });
};

export const useStreamBreakdown = (params: StatsParams) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Streams', params],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsStreamBreakdown(params, { signal })).data,
        enabled: !!api
    });
};

export const useContextBreakdown = (params: StatsParams) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Context', params],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsContext(params, { signal })).data,
        enabled: !!api
    });
};

export const useHeatmap = (params: StatsParams) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Heatmap', params],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsHeatmap(params, { signal })).data,
        enabled: !!api
    });
};

// Recent sessions across all users, or scoped to a single user when userId is set (admin endpoint).
export const useRecentSessions = (params: Pick<StatsParams, 'startDate' | 'endDate' | 'userId' | 'mediaType'>, limit = 50) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['PlaybackStatistics', 'Sessions', params, limit],
        queryFn: async ({ signal }) => (await getPlaybackHistoryApi(api!).getPlaybackStatsSessions({ ...params, limit }, { signal })).data,
        enabled: !!api
    });
};
