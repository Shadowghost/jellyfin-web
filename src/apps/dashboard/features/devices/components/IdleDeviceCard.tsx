import type { DeviceInfoDto } from '@jellyfin/sdk/lib/generated-client/models/device-info-dto';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import Card from '@mui/material/Card';
import React from 'react';

import DeviceHeader from './DeviceHeader';
import DeviceManagementMenu from './DeviceManagementMenu';
import DeviceMeta from './DeviceMeta';

interface IdleDeviceCardProps {
    device: DeviceInfoDto;
    user?: UserDto;
    canDelete: boolean;
}

const IdleDeviceCard = ({ device, user, canDelete }: IdleDeviceCardProps) => (
    <Card sx={{ width: '100%' }}>
        <DeviceHeader
            device={device}
            meta={<DeviceMeta device={device} user={user} />}
            menu={<DeviceManagementMenu device={device} canDelete={canDelete} />}
        />
    </Card>
);

export default IdleDeviceCard;
