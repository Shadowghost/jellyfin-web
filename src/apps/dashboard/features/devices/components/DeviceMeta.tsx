import type { DeviceInfoDto } from '@jellyfin/sdk/lib/generated-client/models/device-info-dto';
import type { SessionInfo } from '@jellyfin/sdk/lib/generated-client/models/session-info';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import formatDistanceToNow from 'date-fns/formatDistanceToNow';
import React, { useMemo } from 'react';

import { ServerConnections } from 'lib/jellyfin-apiclient';
import globalize from 'lib/globalize';
import { getLocaleWithSuffix } from 'utils/dateFnsLocale';

interface DeviceMetaProps {
    device: DeviceInfoDto;
    session?: SessionInfo;
    user?: UserDto;
}

/**
 * The "who / when" line for a device: user avatar + name and last-active time. Lays out as a
 * right-aligned column on wider screens and a single row (below the device name) on small screens.
 */
const DeviceMeta = ({ device, session, user }: DeviceMetaProps) => {
    const userName = session?.UserName || device.LastUserName || user?.Name;

    const userImage = useMemo(() => {
        if (session?.UserId && session.UserPrimaryImageTag && session.ServerId) {
            return ServerConnections.getApiClient(session.ServerId).getUserImageUrl(session.UserId, {
                tag: session.UserPrimaryImageTag,
                type: 'Primary',
                height: 48
            });
        }
        if (user?.Id && user.PrimaryImageTag && window.ApiClient) {
            return window.ApiClient.getUserImageUrl(user.Id, {
                tag: user.PrimaryImageTag,
                type: 'Primary',
                height: 48
            });
        }
        return undefined;
    }, [ session, user ]);

    const lastActivity = session?.LastActivityDate ?? device.DateLastActivity;
    const lastActive = lastActivity ?
        formatDistanceToNow(Date.parse(lastActivity), getLocaleWithSuffix()) :
        undefined;

    if (!userName && !lastActive) {
        return null;
    }

    return (
        <Stack
            direction={{ xs: 'row', sm: 'column' }}
            spacing={{ xs: 1.5, sm: 0.5 }}
            alignItems={{ xs: 'center', sm: 'flex-end' }}
            flexWrap='wrap'
            useFlexGap
            sx={{ minWidth: 0 }}
        >
            {userName && (
                <Stack direction='row' spacing={1} alignItems='center'>
                    <Avatar src={userImage} sx={{ width: 24, height: 24, fontSize: '0.8rem' }}>
                        {userName.charAt(0).toUpperCase()}
                    </Avatar>
                    <Typography variant='body2' noWrap>{userName}</Typography>
                </Stack>
            )}
            {lastActive && (
                <Typography variant='caption' color='text.secondary' noWrap>
                    {globalize.translate('LastActive')}: {lastActive}
                </Typography>
            )}
        </Stack>
    );
};

export default DeviceMeta;
