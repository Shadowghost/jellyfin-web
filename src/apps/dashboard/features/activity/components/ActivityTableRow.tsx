import type { ActivityLogEntry } from '@jellyfin/sdk/lib/generated-client/models/activity-log-entry';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import Dns from '@mui/icons-material/Dns';
import PermMedia from '@mui/icons-material/PermMedia';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

import UserAvatarButton from 'apps/dashboard/components/UserAvatarButton';
import globalize from 'lib/globalize';

import LogLevelChip from './LogLevelChip';

interface ActivityTableRowProps {
    entry: ActivityLogEntry;
    user?: UserDto;
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const ActivityTableRow = ({ entry, user }: ActivityTableRowProps) => {
    const time = entry.Date ?
        new Date(entry.Date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) :
        '';

    return (
        <TableRow hover>
            <TableCell title={time} sx={ellipsis}>{time}</TableCell>
            <TableCell>{entry.Severity && <LogLevelChip level={entry.Severity} />}</TableCell>
            <TableCell>
                {user?.Id ? (
                    <UserAvatarButton user={user} />
                ) : (
                    <Avatar sx={{ width: 32, height: 32 }}><Dns fontSize='small' /></Avatar>
                )}
            </TableCell>
            <TableCell title={entry.Name || undefined} sx={ellipsis}>{entry.Name}</TableCell>
            <TableCell title={entry.ShortOverview || entry.Overview || undefined} sx={{ ...ellipsis, color: 'text.secondary' }}>
                {entry.ShortOverview || entry.Overview}
            </TableCell>
            <TableCell sx={{ ...ellipsis, color: 'text.secondary' }}>{entry.Type}</TableCell>
            <TableCell align='right'>
                {entry.ItemId && (
                    <IconButton
                        component={RouterLink}
                        to={`/details?id=${entry.ItemId}`}
                        title={globalize.translate('LabelMediaDetails')}
                        size='small'
                    >
                        <PermMedia fontSize='small' />
                    </IconButton>
                )}
            </TableCell>
        </TableRow>
    );
};

export default ActivityTableRow;
