import type { ActivityLogEntry } from '@jellyfin/sdk/lib/generated-client/models/activity-log-entry';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import { LogLevel } from '@jellyfin/sdk/lib/generated-client/models/log-level';
import Dns from '@mui/icons-material/Dns';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import formatRelative from 'date-fns/formatRelative';
import React, { type ReactNode, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import UserAvatarButton from 'apps/dashboard/components/UserAvatarButton';
import { getLocale } from 'utils/dateFnsLocale';

import getLogLevelColor from '../utils/getLogLevelColor';

interface ActivityCardProps {
    entry: ActivityLogEntry;
    user?: UserDto;
}

// Bolds the user's name where it appears in the activity sentence so it stands out.
const highlightName = (name?: string | null, userName?: string | null): ReactNode[] => {
    if (!name) {
        return [];
    }
    const index = userName ? name.indexOf(userName) : -1;
    if (!userName || index < 0) {
        return [ name ];
    }
    return [
        name.slice(0, index),
        <Box key='user' component='span' sx={{ fontWeight: 'bold' }}>{userName}</Box>,
        name.slice(index + userName.length)
    ];
};

const ActivityCard = ({ entry, user }: ActivityCardProps) => {
    const relativeDate = useMemo(() => (
        entry.Date ? formatRelative(Date.parse(entry.Date), Date.now(), { locale: getLocale() }) : undefined
    ), [ entry ]);

    const imageUrl = useMemo(() => (
        entry.ItemId && window.ApiClient ?
            window.ApiClient.getScaledImageUrl(entry.ItemId, { type: 'Primary', maxHeight: 200 }) :
            undefined
    ), [ entry ]);

    const overview = entry.ShortOverview || entry.Overview;
    const hasMedia = !!entry.ItemId;

    // Media entries link to the item; online/offline (session) entries link to the device screen.
    const isSessionEvent = entry.Type === 'SessionStarted' || entry.Type === 'SessionEnded';
    let linkTo: string | undefined;
    if (entry.ItemId) {
        linkTo = `/details?id=${entry.ItemId}`;
    } else if (isSessionEvent) {
        // The activity log has no device id, so scope the device view to this user's devices.
        linkTo = user?.Name ?
            `/dashboard/devices?user=${encodeURIComponent(user.Name)}` :
            '/dashboard/devices';
    }

    const name = highlightName(entry.Name, user?.Name);
    const detailColor = hasMedia ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary';
    const color = getLogLevelColor(entry.Severity || LogLevel.Information) ?? 'info';

    return (
        <Card
            sx={{
                width: '100%',
                position: 'relative',
                overflow: 'hidden',
                borderLeft: 4,
                borderLeftColor: `${color}.main`,
                ...(hasMedia && { color: 'common.white' })
            }}
        >
            {hasMedia && (
                <>
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `url(${imageUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(24px)',
                            transform: 'scale(1.15)',
                            opacity: 0.5
                        }}
                    />
                    <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.6)' }} />
                </>
            )}

            <Stack spacing={1} sx={{ position: 'relative', p: 2 }}>
                {/* 1. Date/time */}
                {relativeDate && (
                    <Typography variant='body2' sx={{ fontWeight: 500, color: hasMedia ? 'common.white' : 'text.primary' }}>
                        {relativeDate}
                    </Typography>
                )}

                {/* 2. User & device */}
                <Stack direction='row' spacing={1.5} alignItems='center'>
                    <Box sx={{ flexShrink: 0 }}>
                        {user?.Id ? <UserAvatarButton user={user} /> : <Avatar><Dns /></Avatar>}
                    </Box>
                    <Stack sx={{ minWidth: 0 }} spacing={0.25}>
                        {linkTo ? (
                            <Link
                                component={RouterLink}
                                to={linkTo}
                                variant='subtitle1'
                                color='inherit'
                                underline='hover'
                                sx={{ whiteSpace: 'pre-wrap' }}
                            >
                                {name}
                            </Link>
                        ) : (
                            <Typography variant='subtitle1' sx={{ whiteSpace: 'pre-wrap' }}>{name}</Typography>
                        )}
                        {overview && (
                            <Typography variant='caption' sx={{ color: detailColor, wordBreak: 'break-word' }}>
                                {overview}
                            </Typography>
                        )}
                    </Stack>
                </Stack>

                {/* 3. Media is shown as the card background above. */}
            </Stack>
        </Card>
    );
};

export default ActivityCard;
