import { useApi } from 'hooks/useApi';
import { useEffect, useMemo } from 'react';
import { QUERY_KEY, useSessions } from '../api/useSessions';
import { queryClient } from 'utils/query/queryClient';
import filterSessions from '../utils/filterSessions';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';

const QUERY_PARAMS = {
    activeWithinSeconds: 960
};

const useLiveSessions = () => {
    const { api } = useApi();

    const sessionsQuery = useSessions(QUERY_PARAMS);

    useEffect(() => {
        // The Sessions feed sends the full session list each interval, so replace the cache
        // wholesale — this prunes sessions that stopped or ended instead of leaving them stale.
        return api?.subscribe([ OutboundWebSocketMessageType.Sessions ], ({ Data }) => {
            queryClient.setQueryData([ QUERY_KEY, QUERY_PARAMS ], Data ?? []);
        });
    }, [ api ]);

    // Filter consistently regardless of whether the data came from the REST poll or the WebSocket.
    const data = useMemo(() => filterSessions(sessionsQuery.data ?? []), [ sessionsQuery.data ]);

    return { ...sessionsQuery, data };
};

export default useLiveSessions;
