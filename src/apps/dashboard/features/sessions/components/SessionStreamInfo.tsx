import type { SessionInfo } from '@jellyfin/sdk/lib/generated-client/models/session-info';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useMemo } from 'react';

import globalize from 'lib/globalize';
import getSessionStreamInfo from '../utils/getSessionStreamInfo';

interface SessionStreamInfoProps {
    session: SessionInfo;
}

const formatBytes = (bytes?: number | null): string | null => {
    if (bytes == null || bytes <= 0) {
        return null;
    }
    // Binary units (1024-based), so label as KiB/MiB/GiB rather than the decimal KB/MB/GB.
    const units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${units[unit]}`;
};

const SessionStreamInfo = ({ session }: SessionStreamInfoProps) => {
    const transcoding = session.TranscodingInfo;

    const rows = useMemo(() => getSessionStreamInfo(session), [ session ]);

    const transcodeReasons = useMemo(() => {
        const reasons = transcoding?.TranscodeReasons as unknown as string[] | undefined;
        return reasons?.map(reason => globalize.translate(reason)) ?? [];
    }, [ transcoding ]);

    const transcodedSize = useMemo(() => formatBytes(transcoding?.BytesTranscoded), [ transcoding ]);

    if (rows.length === 0) {
        return null;
    }

    return (
        <Stack spacing={2}>
            {/* Source -> output rows */}
            <Stack spacing={1}>
                {rows.map(row => (
                    <Stack key={row.label} direction='row' alignItems='center' spacing={2}>
                        <Typography variant='body2' sx={{ minWidth: 120, color: 'text.secondary' }}>
                            {row.label}
                        </Typography>
                        <Typography variant='body2' sx={{ flex: 1 }}>{row.source}</Typography>
                        <ArrowForward fontSize='small' sx={{ color: 'text.secondary' }} />
                        <Typography variant='body2' sx={{ flex: 1 }}>{row.output}</Typography>
                    </Stack>
                ))}
            </Stack>

            {/* Transcode status */}
            {transcoding && (
                <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                    <Chip
                        size='small'
                        label={`${globalize.translate('LabelThrottle')}: ${transcoding.IsThrottled ?
                            globalize.translate('On') :
                            globalize.translate('Off')}`}
                        color={transcoding.IsThrottled ? 'warning' : 'default'}
                        variant='outlined'
                    />
                    {transcoding.Speed != null && transcoding.Speed > 0 && (
                        <Chip
                            size='small'
                            label={`${globalize.translate('LabelSpeed')}: ${transcoding.Speed.toFixed(1)}x`}
                            variant='outlined'
                        />
                    )}
                    {transcoding.Framerate ? (
                        <Chip
                            size='small'
                            label={`${transcoding.Framerate.toFixed(0)} fps`}
                            variant='outlined'
                        />
                    ) : null}
                    {transcodedSize && (
                        <Chip
                            size='small'
                            label={`${globalize.translate('LabelSize')}: ${transcodedSize}`}
                            variant='outlined'
                        />
                    )}
                </Stack>
            )}

            {/* Transcode reasons */}
            {transcodeReasons.length > 0 && (
                <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                    {transcodeReasons.map(reason => (
                        <Chip key={reason} size='small' label={reason} variant='outlined' />
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

export default SessionStreamInfo;
