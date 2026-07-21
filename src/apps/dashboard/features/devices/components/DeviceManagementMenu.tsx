import type { DeviceInfoDto } from '@jellyfin/sdk/lib/generated-client/models/device-info-dto';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import MoreVert from '@mui/icons-material/MoreVert';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import React, { useCallback, useState } from 'react';

import { useDeleteDevice } from 'apps/dashboard/features/devices/api/useDeleteDevice';
import { useUpdateDevice } from 'apps/dashboard/features/devices/api/useUpdateDevice';
import ConfirmDialog from 'components/ConfirmDialog';
import InputDialog from 'components/InputDialog';
import globalize from 'lib/globalize';

interface DeviceManagementMenuProps {
    device: DeviceInfoDto;
    canDelete: boolean;
}

const DeviceManagementMenu = ({ device, canDelete }: DeviceManagementMenuProps) => {
    const [ anchorEl, setAnchorEl ] = useState<HTMLElement | null>(null);
    const [ isRenameOpen, setIsRenameOpen ] = useState(false);
    const [ isDeleteOpen, setIsDeleteOpen ] = useState(false);
    const deleteDevice = useDeleteDevice();
    const updateDevice = useUpdateDevice();

    const onOpen = useCallback((e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget), []);
    const onClose = useCallback(() => setAnchorEl(null), []);

    const onRename = useCallback(() => {
        setAnchorEl(null);
        setIsRenameOpen(true);
    }, []);

    const onDeleteClick = useCallback(() => {
        setAnchorEl(null);
        setIsDeleteOpen(true);
    }, []);

    const onRenameConfirm = useCallback((name: string) => {
        if (device.Id) {
            updateDevice.mutate({
                id: device.Id,
                deviceOptionsDto: { CustomName: name.trim() || undefined }
            });
        }
        setIsRenameOpen(false);
    }, [ device, updateDevice ]);

    const onDeleteConfirm = useCallback(() => {
        if (device.Id) {
            deleteDevice.mutate({ id: [ device.Id ] });
        }
        setIsDeleteOpen(false);
    }, [ device, deleteDevice ]);

    const onRenameClose = useCallback(() => setIsRenameOpen(false), []);
    const onDeleteCancel = useCallback(() => setIsDeleteOpen(false), []);

    return (
        <>
            <IconButton onClick={onOpen} title={globalize.translate('ButtonMore')}>
                <MoreVert />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
                <MenuItem onClick={onRename}>
                    <ListItemIcon><Edit fontSize='small' /></ListItemIcon>
                    <ListItemText>{globalize.translate('Edit')}</ListItemText>
                </MenuItem>
                {canDelete && (
                    <MenuItem onClick={onDeleteClick}>
                        <ListItemIcon><Delete fontSize='small' color='error' /></ListItemIcon>
                        <ListItemText>{globalize.translate('Delete')}</ListItemText>
                    </MenuItem>
                )}
            </Menu>

            {isRenameOpen && (
                <InputDialog
                    open
                    onClose={onRenameClose}
                    title={globalize.translate('Edit')}
                    label={globalize.translate('LabelDevice')}
                    initialText={device.CustomName || device.Name || ''}
                    confirmButtonText={globalize.translate('Save')}
                    onConfirm={onRenameConfirm}
                />
            )}

            <ConfirmDialog
                open={isDeleteOpen}
                title={globalize.translate('HeaderDeleteDevice')}
                text={globalize.translate('DeleteDeviceConfirmation')}
                onCancel={onDeleteCancel}
                onConfirm={onDeleteConfirm}
                confirmButtonColor='error'
                confirmButtonText={globalize.translate('Delete')}
            />
        </>
    );
};

export default DeviceManagementMenu;
