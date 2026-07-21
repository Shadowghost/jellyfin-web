import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';
import type { TranscodingInfo } from '@jellyfin/sdk/lib/generated-client/models/transcoding-info';
import { useEffect, useMemo, useRef } from 'react';

/**
 * Returns the session with its last-known TranscodingInfo retained while playback is paused.
 * The server briefly drops TranscodingInfo on pause, which would otherwise blank the stream rows
 * and pipeline graph; we re-inject the retained info as long as the same item is still loaded.
 */
const useEffectiveSession = (session: SessionInfoDto): SessionInfoDto => {
    const retainedRef = useRef<{ itemId?: string, transcodingInfo: TranscodingInfo } | null>(null);

    useEffect(() => {
        if (session.TranscodingInfo) {
            retainedRef.current = {
                itemId: session.NowPlayingItem?.Id ?? undefined,
                transcodingInfo: session.TranscodingInfo
            };
        }
    }, [ session ]);

    return useMemo(() => {
        if (session.TranscodingInfo) {
            return session;
        }
        const retained = retainedRef.current;
        if (retained && retained.itemId === (session.NowPlayingItem?.Id ?? undefined)) {
            return { ...session, TranscodingInfo: retained.transcodingInfo };
        }
        return session;
    }, [ session ]);
};

export default useEffectiveSession;
