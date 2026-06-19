import type { DeviceInfoDto } from '@jellyfin/sdk/lib/generated-client/models/device-info-dto';
import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';
import Delete from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDeleteDevice } from 'apps/dashboard/features/devices/api/useDeleteDevice';
import { useDevices } from 'apps/dashboard/features/devices/api/useDevices';
import DeviceHeader from 'apps/dashboard/features/devices/components/DeviceHeader';
import DeviceManagementMenu from 'apps/dashboard/features/devices/components/DeviceManagementMenu';
import DeviceMeta from 'apps/dashboard/features/devices/components/DeviceMeta';
import IdleDeviceCard from 'apps/dashboard/features/devices/components/IdleDeviceCard';
import SessionCard from 'apps/dashboard/features/sessions/components/SessionCard';
import useLiveSessions from 'apps/dashboard/features/sessions/hooks/useLiveSessions';
import ConfirmDialog from 'components/ConfirmDialog';
import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import { useApi } from 'hooks/useApi';
import { useUsersDetails } from 'hooks/useUsers';
import globalize from 'lib/globalize';

const INITIAL_VISIBLE = 12;
const LOAD_MORE = 12;

// Horizontal gutter matching the app bar toolbar (16px mobile / 24px desktop), so page content
// lines up with the header elements above it.
const GUTTER = { xs: 2, sm: 3 };

const lastActivityTime = (device: DeviceInfoDto): number => (
    device.DateLastActivity ? Date.parse(device.DateLastActivity) : 0
);

export const Component = () => {
    const { api } = useApi();
    const { data, isLoading: isDevicesLoading, isError: isDevicesError } = useDevices({});
    const { usersById, names: userNames, isLoading: isUsersLoading, isError: isUsersError } = useUsersDetails();
    const { data: liveSessions } = useLiveSessions();

    const [ searchParams ] = useSearchParams();
    const expandedDeviceId = searchParams.get('expanded');

    const [ isDeleteAllOpen, setIsDeleteAllOpen ] = useState(false);
    const [ visibleCount, setVisibleCount ] = useState(INITIAL_VISIBLE);
    const [ search, setSearch ] = useState('');
    const [ userFilter, setUserFilter ] = useState(searchParams.get('user') ?? '');
    const [ playingOnly, setPlayingOnly ] = useState(false);
    const deleteDevice = useDeleteDevice();

    const onSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value), []);
    const onUserChange = useCallback((e: SelectChangeEvent) => setUserFilter(e.target.value), []);
    const onPlayingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setPlayingOnly(e.target.checked), []);

    const devices = useMemo(() => data?.Items ?? [], [ data ]);

    const sessionByDevice = useMemo(() => {
        const map = new Map<string, SessionInfoDto>();
        (liveSessions ?? []).forEach(session => {
            if (session.DeviceId && session.NowPlayingItem) {
                map.set(session.DeviceId, session);
            }
        });
        return map;
    }, [ liveSessions ]);

    // Currently-playing devices first, then most-recently-active.
    const sortedDevices = useMemo(() => (
        [ ...devices ].sort((a, b) => {
            const aPlaying = a.Id && sessionByDevice.has(a.Id) ? 1 : 0;
            const bPlaying = b.Id && sessionByDevice.has(b.Id) ? 1 : 0;
            if (aPlaying !== bPlaying) {
                return bPlaying - aPlaying;
            }
            return lastActivityTime(b) - lastActivityTime(a);
        })
    ), [ devices, sessionByDevice ]);

    const filteredDevices = useMemo(() => {
        const query = search.trim().toLowerCase();
        return sortedDevices.filter(device => {
            const session = device.Id ? sessionByDevice.get(device.Id) : undefined;

            if (playingOnly && !session) {
                return false;
            }
            if (userFilter && (session?.UserName || device.LastUserName) !== userFilter) {
                return false;
            }
            if (query) {
                const haystack = [ device.CustomName, device.Name, device.AppName, session?.UserName, device.LastUserName ]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(query)) {
                    return false;
                }
            }
            return true;
        });
    }, [ sortedDevices, sessionByDevice, search, userFilter, playingOnly ]);

    const visibleDevices = filteredDevices.slice(0, visibleCount);
    const hasMore = visibleCount < filteredDevices.length;

    // Restart the visible window when the filters change.
    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE);
    }, [ search, userFilter, playingOnly ]);

    // Infinite scroll: a callback ref attaches the observer exactly when the sentinel mounts
    // (reliable on a fresh/hard reload, unlike a useEffect whose timing can miss the element).
    const observerRef = useRef<IntersectionObserver | null>(null);
    const sentinelRef = useCallback((node: HTMLDivElement | null) => {
        observerRef.current?.disconnect();
        if (!node) {
            return;
        }
        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting) {
                setVisibleCount(count => count + LOAD_MORE);
            }
        }, { rootMargin: '600px' });
        observerRef.current.observe(node);
    }, []);

    const onDeleteAll = useCallback(() => setIsDeleteAllOpen(true), []);
    const onCloseDeleteAll = useCallback(() => setIsDeleteAllOpen(false), []);
    // Delete only the currently shown (filtered) devices, never the device we're browsing on.
    const onConfirmDeleteAll = useCallback(() => {
        Promise
            .all(filteredDevices.map(item => {
                if (item.Id && !(api && api.deviceInfo.id === item.Id)) {
                    return deleteDevice.mutateAsync({ id: [item.Id] });
                }
                return Promise.resolve();
            }))
            .catch(err => {
                console.error('[DevicesPage] failed deleting devices', err);
            })
            .finally(onCloseDeleteAll);
    }, [ api, deleteDevice, filteredDevices, onCloseDeleteAll ]);

    const isLoading = isDevicesLoading || isUsersLoading;
    const isError = isDevicesError || isUsersError;

    return (
        <Page
            id='devicesPage'
            className='mainAnimatedPage type-interior'
            title={globalize.translate('HeaderDevices')}
        >
            {/* Drop the content-primary side gutter so the sticky bar is truly full-width;
                the gutter is re-applied to the title and content below instead. */}
            <div className='content-primary' style={{ paddingLeft: 0, paddingRight: 0 }}>
                <Stack spacing={3}>
                    <Stack direction='row' justifyContent='space-between' alignItems='center' spacing={2} sx={{ px: GUTTER }}>
                        <Typography variant='h1'>{globalize.translate('HeaderDevices')}</Typography>
                        <Button color='error' startIcon={<Delete />} onClick={onDeleteAll}>
                            {globalize.translate('DeleteAll')}
                        </Button>
                    </Stack>

                    <Box
                        sx={{
                            position: 'sticky',
                            // Dock just below the fixed dense app bar rather than the screen top.
                            top: 48,
                            zIndex: 2,
                            bgcolor: 'background.default',
                            py: 1.5,
                            px: GUTTER,
                            borderBottom: 1,
                            borderColor: 'divider'
                        }}
                    >
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                            <TextField
                                size='small'
                                label={globalize.translate('Search')}
                                value={search}
                                onChange={onSearchChange}
                                sx={{ flexGrow: 1, maxWidth: { sm: 360 } }}
                            />
                            <FormControl size='small' sx={{ minWidth: 180 }}>
                                <InputLabel id='device-user-filter-label'>{globalize.translate('LabelUser')}</InputLabel>
                                <Select
                                    labelId='device-user-filter-label'
                                    label={globalize.translate('LabelUser')}
                                    value={userFilter}
                                    onChange={onUserChange}
                                >
                                    <MenuItem value=''>{globalize.translate('All')}</MenuItem>
                                    {userNames.map(name => (
                                        <MenuItem key={name} value={name}>{name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControlLabel
                                control={<Switch checked={playingOnly} onChange={onPlayingChange} />}
                                label={globalize.translate('HeaderNowPlaying')}
                            />
                        </Stack>
                    </Box>

                    {isError && (
                        <Typography color='error' sx={{ px: GUTTER }}>{globalize.translate('DevicesLoadError')}</Typography>
                    )}

                    {isLoading ? (
                        <Loading />
                    ) : (
                        <Stack spacing={2} sx={{ px: GUTTER }}>
                            {visibleDevices.map(device => {
                                const session = device.Id ? sessionByDevice.get(device.Id) : undefined;
                                const canDelete = !(api && device.Id && api.deviceInfo.id === device.Id);

                                return session?.NowPlayingItem ? (
                                    <SessionCard
                                        key={device.Id}
                                        session={session}
                                        defaultExpanded={!!expandedDeviceId && device.Id === expandedDeviceId}
                                        header={(
                                            <DeviceHeader
                                                device={device}
                                                meta={(
                                                    <DeviceMeta
                                                        device={device}
                                                        session={session}
                                                        user={device.LastUserId ? usersById[device.LastUserId] : undefined}
                                                    />
                                                )}
                                                menu={<DeviceManagementMenu device={device} canDelete={canDelete} />}
                                            />
                                        )}
                                    />
                                ) : (
                                    <IdleDeviceCard
                                        key={device.Id}
                                        device={device}
                                        user={device.LastUserId ? usersById[device.LastUserId] : undefined}
                                        canDelete={canDelete}
                                    />
                                );
                            })}
                            {hasMore && <Box ref={sentinelRef} sx={{ height: 1 }} />}
                        </Stack>
                    )}
                </Stack>
            </div>

            <ConfirmDialog
                open={isDeleteAllOpen}
                title={globalize.translate('HeaderDeleteDevices')}
                text={globalize.translate('DeleteDevicesConfirmation')}
                onCancel={onCloseDeleteAll}
                onConfirm={onConfirmDeleteAll}
                confirmButtonColor='error'
                confirmButtonText={globalize.translate('Delete')}
            />
        </Page>
    );
};

Component.displayName = 'DevicesPage';
