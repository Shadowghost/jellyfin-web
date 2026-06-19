import type { DeviceInfoDto } from '@jellyfin/sdk/lib/generated-client/models/device-info-dto';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useMemo } from 'react';

import { getDeviceIcon } from 'utils/image';

interface DeviceHeaderProps {
    device: DeviceInfoDto;
    /** The "who / when" line (user + last active). Inline on wider screens, below the name on mobile. */
    meta?: React.ReactNode;
    /** The management menu, always pinned to the top-right. */
    menu?: React.ReactNode;
}

// Left inset (icon width + gap) so the mobile meta row lines up under the device name.
const META_INSET = '52px';

const DeviceHeader = ({ device, meta, menu }: DeviceHeaderProps) => {
    const deviceIcon = useMemo(() => getDeviceIcon(device), [ device ]);
    const name = device.CustomName || device.Name;
    const app = [ device.AppName, device.AppVersion ].filter(Boolean).join(' ');

    return (
        <Stack spacing={1} sx={{ p: 2 }}>
            <Stack direction='row' spacing={2} alignItems='center'>
                <Box
                    component='img'
                    src={deviceIcon}
                    alt={device.AppName || ''}
                    sx={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
                />
                <Stack sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant='h3' noWrap title={name || undefined}>{name}</Typography>
                    {app && (
                        <Typography variant='body2' color='text.secondary' noWrap>{app}</Typography>
                    )}
                </Stack>
                {meta && (
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>{meta}</Box>
                )}
                {menu}
            </Stack>
            {meta && (
                <Box sx={{ display: { xs: 'block', sm: 'none' }, pl: META_INSET }}>{meta}</Box>
            )}
        </Stack>
    );
};

export default DeviceHeader;
