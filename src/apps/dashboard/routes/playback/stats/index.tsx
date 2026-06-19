import React, { type FC, useCallback, useMemo, useState } from 'react';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import {
    MaterialReactTable,
    useMaterialReactTable,
    type MRT_ColumnDef,
    type MRT_PaginationState,
    type MRT_Row,
    type MRT_SortingState
} from 'material-react-table';

import Page from 'components/Page';
import globalize from 'lib/globalize';
import { useApi } from 'hooks/useApi';
import {
    PlaybackStatsInterval,
    useStatsSummary,
    useStatsTimeline,
    useTopItems,
    useUserStats,
    useStreamBreakdown,
    useContextBreakdown,
    useHeatmap,
    useRecentSessions,
    type NameCountDto,
    type PlaybackHistoryDto,
    type PlaybackStatsHeatmapEntryDto,
    type PlaybackStatsItemDto,
    type PlaybackStatsUserDto
} from 'apps/dashboard/features/playback/api/usePlaybackStatistics';

const MEDIA_TYPES = ['Movie', 'Episode', 'Audio', 'MusicVideo', 'Book'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const RESOLUTION_ORDER = ['144p', '240p', '360p', '384p', '404p', '480p', '540p', '576p', '720p', '1080p', '4K', '8K', 'Unknown'];

const Heatmap = ({ data }: { data?: PlaybackStatsHeatmapEntryDto[] }) => {
    const grid = useMemo(() => {
        const cells = DAY_LABELS.map(() => HOURS.map(() => 0));
        let max = 0;
        for (const e of data ?? []) {
            const d = e.DayOfWeek ?? 0;
            const h = e.Hour ?? 0;
            const v = e.Plays ?? 0;
            if (d >= 0 && d < 7 && h >= 0 && h < 24) {
                cells[d][h] = v;
                if (v > max) max = v;
            }
        }

        return { cells, max };
    }, [data]);

    const [selected, setSelected] = useState<string | null>(null);

    // Event delegation: native title tooltips don't fire on touch, so a tap updates a caption instead.
    const handleSelect = useCallback((e: React.MouseEvent<HTMLElement>) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-hour]');
        if (!cell) {
            return;
        }

        const d = Number(cell.dataset.day);
        const h = Number(cell.dataset.hour);
        const plays = grid.cells[d][h];
        setSelected(`${DAY_LABELS[d]} ${h.toString().padStart(2, '0')}:00 — ${plays} ${plays === 1 ? 'play' : 'plays'}`);
    }, [grid]);

    return (
        <Box>
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1, minHeight: '1.25rem' }}>
                {selected ?? 'Tap a cell to see its play count'}
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
                <Box
                    onClick={handleSelect}
                    sx={{ display: 'grid', gridTemplateColumns: 'auto repeat(24, 1fr)', gap: '2px', minWidth: 560 }}
                >
                    <Box />
                    {HOURS.map(h => (
                        <Typography key={`hour-${h}`} variant='caption' align='center' color='text.secondary'>{h % 6 === 0 ? h : ''}</Typography>
                    ))}
                    {DAY_LABELS.map((day, d) => (
                        <React.Fragment key={day}>
                            <Typography variant='caption' color='text.secondary' sx={{ pr: 1 }}>{day}</Typography>
                            {HOURS.map(h => (
                                <Box
                                    key={`${day}-${h}`}
                                    data-day={d}
                                    data-hour={h}
                                    title={`${day} ${h}:00 — ${grid.cells[d][h]} plays`}
                                    sx={{
                                        aspectRatio: '1 / 1',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                        backgroundColor: 'primary.main',
                                        opacity: grid.max > 0 ? 0.12 + (0.88 * grid.cells[d][h] / grid.max) : 0.08
                                    }}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </Box>
            </Box>
        </Box>
    );
};

const PERIODS = [
    { value: '7', days: 7 },
    { value: '30', days: 30 },
    { value: '90', days: 90 },
    { value: '365', days: 365 },
    { value: 'all', days: 0 }
];

const ticksToHours = (ticks: number) => ticks / 36_000_000_000;
const formatDuration = (ticks?: number) => {
    if (ticks == null) {
        return '—';
    }

    const totalSeconds = Math.round(ticks / 10_000_000);
    if (totalSeconds <= 0) {
        return '0m';
    }

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) {
        return `${h}h ${m}m`;
    }

    if (m > 0) {
        return `${m}m`;
    }

    return `${totalSeconds}s`;
};
const pct = (part?: number, whole?: number) => ((whole ?? 0) > 0 ? `${Math.round(((part ?? 0) / (whole as number)) * 100)}%` : '—');
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '');

const formatBitrate = (bps?: number | null) => {
    if (bps == null || bps <= 0) {
        return '—';
    }

    return bps >= 1_000_000 ? `${(bps / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`;
};

const formatBytes = (bytes?: number) => {
    if (bytes == null || bytes <= 0) {
        return '—';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const KpiCard = ({ label, value }: { label: string; value: string | number }) => (
    <Paper sx={{ p: 2, minWidth: 150, flexGrow: 1 }}>
        <Typography variant='h4'>{value}</Typography>
        <Typography variant='body2' color='text.secondary'>{label}</Typography>
    </Paper>
);

// Explicit palette so the custom HTML legend (below) matches the chart colors.
const CHART_COLORS = ['#3f8cff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#39c5cf', '#db61a2', '#e3b341', '#6e7681', '#57606a'];
const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];

interface PieDatum { id: number; value: number; label: string; color: string }

const toPie = (data?: NameCountDto[]): PieDatum[] => (data ?? [])
    .filter(d => (d.Count ?? 0) > 0)
    .map((d, i) => ({ id: i, value: d.Count ?? 0, label: d.Name || 'Unknown', color: chartColor(i) }));

// A wrapping HTML legend rendered below a chart, so it never overlaps the plot on narrow screens.
const ChartLegend = ({ items }: { items: { label: string; color: string }[] }) => (
    <Stack direction='row' flexWrap='wrap' useFlexGap spacing={1.5} sx={{ mt: 1, justifyContent: 'center' }}>
        {items.map(item => (
            <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: item.color, flexShrink: 0 }} />
                <Typography variant='caption' color='text.secondary'>{item.label}</Typography>
            </Box>
        ))}
    </Stack>
);

// Pie chart with the built-in (overlapping) legend hidden and a wrapping HTML legend underneath.
const PieWithLegend = ({ data }: { data: PieDatum[] }) => (
    <>
        <PieChart height={250} series={[{ data }]} slotProps={{ legend: { hidden: true } }} />
        <ChartLegend items={data.map(d => ({ label: d.label, color: d.color }))} />
    </>
);

const pctFormatter = (v: number | null) => (v == null ? '' : `${Math.round(v)}%`);

// Two 100%-normalised bars (Source, Delivered) stacked by category, so the proportional shift is visible.
const buildStacked = (source?: NameCountDto[], delivered?: NameCountDto[], order?: string[]) => {
    const srcMap = new Map((source ?? []).filter(c => (c.Count ?? 0) > 0).map(c => [c.Name || 'Unknown', c.Count ?? 0]));
    const delMap = new Map((delivered ?? []).filter(c => (c.Count ?? 0) > 0).map(c => [c.Name || 'Unknown', c.Count ?? 0]));
    const srcTotal = [...srcMap.values()].reduce((a, c) => a + c, 0);
    const delTotal = [...delMap.values()].reduce((a, c) => a + c, 0);

    const labels = Array.from(new Set([...srcMap.keys(), ...delMap.keys()]));
    const comboTotal = (label: string) => (srcMap.get(label) ?? 0) + (delMap.get(label) ?? 0);
    const rank = (label: string) => {
        const i = order ? order.indexOf(label) : -1;
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    if (order) {
        labels.sort((a, b) => rank(a) - rank(b));
    } else {
        labels.sort((a, b) => comboTotal(b) - comboTotal(a));
    }

    const toPct = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);
    const series = labels.map((label, i) => ({
        label,
        color: chartColor(i),
        data: [toPct(srcMap.get(label) ?? 0, srcTotal), toPct(delMap.get(label) ?? 0, delTotal)]
    }));

    return { series, hasData: srcTotal > 0 || delTotal > 0 };
};

// Source-vs-delivered comparison for one dimension: two 100%-stacked columns side by side.
const SourceDeliveredBars = ({ title, source, delivered, order }: {
    title: string;
    source?: NameCountDto[];
    delivered?: NameCountDto[];
    order?: string[];
}) => {
    const { series, hasData } = buildStacked(source, delivered, order);

    return (
        <Paper sx={{ p: 2, flexGrow: 1, minWidth: 260 }}>
            <Typography variant='h3' sx={{ mb: 1 }}>{title}</Typography>
            {hasData ? (
                <>
                    <BarChart
                        height={260}
                        xAxis={[{ scaleType: 'band', data: ['Source', 'Delivered'] }]}
                        yAxis={[{ min: 0, max: 100, valueFormatter: pctFormatter }]}
                        series={series.map(s => ({ data: s.data, label: s.label, color: s.color, stack: 'total', valueFormatter: pctFormatter }))}
                        slotProps={{ legend: { hidden: true } }}
                        margin={{ left: 44, right: 12 }}
                    />
                    <ChartLegend items={series.map(s => ({ label: s.label, color: s.color }))} />
                </>
            ) : (
                <Typography color='text.secondary'>No data.</Typography>
            )}
        </Paper>
    );
};

// Keep a title-link click from also triggering the surrounding (clickable) table row.
const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();

const ItemTitleLink = ({ itemId, title }: { itemId?: string | null; title?: string | null }) => {
    if (!itemId) {
        return <span>{title || 'Removed item'}</span>;
    }

    return (
        <Link component={RouterLink} to={`/details?id=${itemId}`} onClick={stopRowClick}>
            {title || 'Untitled'}
        </Link>
    );
};

const ItemTitleCell: FC<{ row: MRT_Row<PlaybackStatsItemDto> }> = ({ row }) => (
    <ItemTitleLink itemId={row.original.ItemId} title={row.original.Title} />
);

const SessionTitleCell: FC<{ row: MRT_Row<PlaybackHistoryDto> }> = ({ row }) => (
    <ItemTitleLink itemId={row.original.ItemId} title={row.original.Title} />
);

type SessionStream = NonNullable<PlaybackHistoryDto['Streams']>[number];
const STREAM_ORDER: Record<string, number> = { Video: 0, Audio: 1, Subtitle: 2 };
const originRank = (origin?: string) => (origin === 'Source' ? 0 : 1);

const streamResolution = (s: SessionStream) => {
    if (s.Width && s.Height) {
        return `${s.Width}×${s.Height}`;
    }

    return s.Height ? `${s.Height}p` : '—';
};

const streamFlags = (s: SessionStream) => {
    if (s.StreamType === 'Video') {
        return s.VideoRange ?? '';
    }

    if (s.StreamType === 'Subtitle') {
        return [s.IsForced ? 'Forced' : '', s.IsHearingImpaired ? 'SDH' : ''].filter(Boolean).join(', ');
    }

    return '';
};

// Click a session row to inspect the input (source) vs output (delivered) streams it was played with.
// Prefer the network bytes measured during delivery; fall back to the bitrate-based estimate.
const sessionDataTransferred = (session: PlaybackHistoryDto | null) => {
    if (session?.ActualBytesTransferred != null) {
        return `${formatBytes(session.ActualBytesTransferred)} (measured)`;
    }

    if (session?.Bitrate && (session.PlayedDurationTicks ?? 0) > 0) {
        return `${formatBytes((session.Bitrate * (session.PlayedDurationTicks ?? 0)) / 10_000_000 / 8)} (est.)`;
    }

    return '—';
};

const SessionDetailsDialog = ({ session, onClose }: { session: PlaybackHistoryDto | null; onClose: () => void }) => {
    const streams = [...(session?.Streams ?? [])].sort((a, b) =>
        (STREAM_ORDER[a.StreamType ?? 'Video'] - STREAM_ORDER[b.StreamType ?? 'Video'])
        || (originRank(a.Origin) - originRank(b.Origin)));

    return (
        <Dialog open={Boolean(session)} onClose={onClose} maxWidth='md' fullWidth>
            <DialogTitle>{session?.Title || 'Session'}</DialogTitle>
            <DialogContent dividers>
                <Stack direction='row' spacing={3} flexWrap='wrap' useFlexGap sx={{ mb: 2 }}>
                    <Typography variant='body2'>Started: {session?.DateStarted ? new Date(session.DateStarted).toLocaleString() : '—'}</Typography>
                    <Typography variant='body2'>Watch time: {formatDuration(session?.PlayedDurationTicks)}</Typography>
                    <Typography variant='body2'>Completed: {session?.PlayedToCompletion ? 'Yes' : 'No'}</Typography>
                    <Typography variant='body2'>Delivery: {session?.Transcoded ? 'Transcode' : 'Direct play'}</Typography>
                    <Typography variant='body2'>Session bitrate: {formatBitrate(session?.Bitrate)}</Typography>
                    <Typography variant='body2'>Data transferred: {sessionDataTransferred(session)}</Typography>
                    <Typography variant='body2'>Client: {session?.ClientName || '—'}</Typography>
                </Stack>
                {streams.length > 0 ? (
                    <Table size='small'>
                        <TableHead>
                            <TableRow>
                                <TableCell>Stream</TableCell>
                                <TableCell>I/O</TableCell>
                                <TableCell>Codec</TableCell>
                                <TableCell>Resolution</TableCell>
                                <TableCell>Bitrate</TableCell>
                                <TableCell>Channels</TableCell>
                                <TableCell>Language</TableCell>
                                <TableCell>Flags</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {streams.map(s => (
                                <TableRow key={`${s.StreamType}-${s.Origin}`}>
                                    <TableCell>{s.StreamType}</TableCell>
                                    <TableCell>{s.Origin === 'Delivered' ? 'Output' : 'Input'}</TableCell>
                                    <TableCell>{s.Codec || '—'}</TableCell>
                                    <TableCell>{s.StreamType === 'Video' ? streamResolution(s) : '—'}</TableCell>
                                    <TableCell>{formatBitrate(s.Bitrate)}</TableCell>
                                    <TableCell>{s.StreamType === 'Audio' ? (s.Channels ?? '—') : '—'}</TableCell>
                                    <TableCell>{s.Language || '—'}</TableCell>
                                    <TableCell>{streamFlags(s) || '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <Typography color='text.secondary'>No stream details recorded for this session.</Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

const DEFAULT_SORT: MRT_SortingState = [{ id: 'WatchTimeTicks', desc: true }];

export const Component = () => {
    const { api } = useApi();
    // Filters persist across page switches.
    const [period, setPeriod] = useState(() => localStorage.getItem('playbackStats.period') ?? '30');
    const [userId, setUserId] = useState(() => localStorage.getItem('playbackStats.userId') ?? '');
    const [interval, setInterval] = useState<PlaybackStatsInterval>(
        () => (localStorage.getItem('playbackStats.interval') as PlaybackStatsInterval) || PlaybackStatsInterval.Day
    );
    const [mediaType, setMediaType] = useState(() => localStorage.getItem('playbackStats.mediaType') ?? '');

    const [selectedSession, setSelectedSession] = useState<PlaybackHistoryDto | null>(null);
    const closeSession = useCallback(() => setSelectedSession(null), []);

    const [itemSorting, setItemSorting] = useState<MRT_SortingState>(DEFAULT_SORT);
    const [itemPagination, setItemPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 10 });
    const [userSorting, setUserSorting] = useState<MRT_SortingState>(DEFAULT_SORT);
    const [userPagination, setUserPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 10 });

    const params = useMemo(() => {
        const days = PERIODS.find(p => p.value === period)?.days ?? 30;
        const startDate = days > 0 ? new Date(Date.now() - (days * 86_400_000)).toISOString() : undefined;
        return { startDate, userId: userId || undefined, mediaType: mediaType || undefined };
    }, [period, userId, mediaType]);

    const handlePeriodChange = useCallback((e: SelectChangeEvent) => {
        setPeriod(e.target.value);
        localStorage.setItem('playbackStats.period', e.target.value);
    }, []);
    const handleUserChange = useCallback((e: SelectChangeEvent) => {
        setUserId(e.target.value);
        localStorage.setItem('playbackStats.userId', e.target.value);
    }, []);
    const handleIntervalChange = useCallback((e: SelectChangeEvent) => {
        setInterval(e.target.value as PlaybackStatsInterval);
        localStorage.setItem('playbackStats.interval', e.target.value);
    }, []);
    const handleMediaTypeChange = useCallback((e: SelectChangeEvent) => {
        setMediaType(e.target.value);
        localStorage.setItem('playbackStats.mediaType', e.target.value);
    }, []);

    const usersQuery = useQuery({
        queryKey: ['Users'],
        queryFn: async ({ signal }) => (await getUserApi(api!).getUsers(undefined, { signal })).data,
        enabled: !!api
    });

    const summary = useStatsSummary(params);
    const timeline = useStatsTimeline(params, interval);
    const topItems = useTopItems(params, {
        sortBy: itemSorting[0]?.id,
        descending: itemSorting[0]?.desc ?? true,
        startIndex: itemPagination.pageIndex * itemPagination.pageSize,
        limit: itemPagination.pageSize
    });
    const userStats = useUserStats({ startDate: params.startDate, mediaType: params.mediaType }, {
        sortBy: userSorting[0]?.id,
        descending: userSorting[0]?.desc ?? true,
        startIndex: userPagination.pageIndex * userPagination.pageSize,
        limit: userPagination.pageSize
    });
    const streams = useStreamBreakdown(params);
    const context = useContextBreakdown(params);
    const heatmap = useHeatmap(params);
    const history = useRecentSessions({ startDate: params.startDate, userId: params.userId, mediaType: params.mediaType }, 50);

    const summaryData = summary.data;
    const streamData = streams.data;
    const contextData = context.data;

    const itemColumns = useMemo<MRT_ColumnDef<PlaybackStatsItemDto>[]>(() => [
        { accessorKey: 'Title', header: 'Title', enableSorting: false, Cell: ItemTitleCell },
        { accessorKey: 'Plays', header: 'Plays' },
        { accessorKey: 'Completions', header: 'Completions' },
        { accessorKey: 'WatchTimeTicks', header: 'Watch time', Cell: ({ cell }) => formatDuration(cell.getValue<number>()) },
        { accessorKey: 'LastPlayed', header: 'Last played', Cell: ({ cell }) => formatDate(cell.getValue<string>()) }
    ], []);

    const userColumns = useMemo<MRT_ColumnDef<PlaybackStatsUserDto>[]>(() => [
        { accessorKey: 'UserName', header: 'User', enableSorting: false, Cell: ({ row }) => row.original.UserName ?? row.original.UserId },
        { accessorKey: 'Plays', header: 'Plays' },
        { accessorKey: 'Completions', header: 'Completions' },
        { accessorKey: 'WatchTimeTicks', header: 'Watch time', Cell: ({ cell }) => formatDuration(cell.getValue<number>()) },
        { accessorKey: 'LastActivity', header: 'Last active', Cell: ({ cell }) => formatDate(cell.getValue<string>()) }
    ], []);

    const itemTable = useMaterialReactTable({
        columns: itemColumns,
        data: topItems.data?.Items ?? [],
        manualSorting: true,
        manualPagination: true,
        rowCount: topItems.data?.TotalRecordCount ?? 0,
        state: { sorting: itemSorting, pagination: itemPagination, isLoading: topItems.isPending },
        onSortingChange: setItemSorting,
        onPaginationChange: setItemPagination,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableGlobalFilter: false,
        enableDensityToggle: false,
        enableHiding: false,
        enableFullScreenToggle: false,
        getRowId: (row, index) => row.ItemId ?? `row-${index}`
    });

    const historyColumns = useMemo<MRT_ColumnDef<PlaybackHistoryDto>[]>(() => [
        ...(userId ? [] : [{
            accessorKey: 'UserName' as const,
            header: 'User',
            Cell: ({ row }: { row: { original: PlaybackHistoryDto } }) => row.original.UserName ?? row.original.UserId
        }]),
        { accessorKey: 'Title', header: 'Title', Cell: SessionTitleCell },
        { accessorKey: 'DateStarted', header: 'Started', Cell: ({ cell }) => new Date(cell.getValue<string>()).toLocaleString() },
        { accessorKey: 'PlayedDurationTicks', header: 'Watch time', Cell: ({ cell }) => formatDuration(cell.getValue<number>()) },
        { accessorKey: 'Bitrate', header: 'Bitrate', Cell: ({ cell }) => formatBitrate(cell.getValue<number | null>()) },
        { accessorKey: 'PlayedToCompletion', header: 'Completed', Cell: ({ cell }) => (cell.getValue<boolean>() ? '✓' : '') }
    ], [userId]);

    const historyTable = useMaterialReactTable({
        columns: historyColumns,
        data: history.data ?? [],
        state: { isLoading: history.isPending },
        enableColumnActions: false,
        enableColumnFilters: false,
        enableGlobalFilter: false,
        enableDensityToggle: false,
        enableHiding: false,
        enableFullScreenToggle: false,
        initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
        getRowId: (row, index) => row.Id ?? `row-${index}`,
        muiTableBodyRowProps: ({ row }) => ({
            onClick: () => setSelectedSession(row.original),
            sx: { cursor: 'pointer' }
        })
    });

    const userTable = useMaterialReactTable({
        columns: userColumns,
        data: userStats.data?.Items ?? [],
        manualSorting: true,
        manualPagination: true,
        rowCount: userStats.data?.TotalRecordCount ?? 0,
        state: { sorting: userSorting, pagination: userPagination, isLoading: userStats.isPending },
        onSortingChange: setUserSorting,
        onPaginationChange: setUserPagination,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableGlobalFilter: false,
        enableDensityToggle: false,
        enableHiding: false,
        enableFullScreenToggle: false,
        getRowId: (row, index) => row.UserId ?? `row-${index}`
    });

    return (
        <Page
            id='playbackStatisticsPage'
            title={globalize.translate('HeaderPlaybackStatistics')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Stack spacing={3} sx={{ my: 2 }}>
                    <Typography variant='h2'>
                        {globalize.translate('HeaderPlaybackStatistics')}
                    </Typography>

                    {/* Filters */}
                    <Stack direction='row' spacing={2} flexWrap='wrap' useFlexGap>
                        <FormControl size='small' sx={{ minWidth: 160 }}>
                            <InputLabel id='period-label'>Period</InputLabel>
                            <Select labelId='period-label' label='Period' value={period} onChange={handlePeriodChange}>
                                <MenuItem value='7'>Last 7 days</MenuItem>
                                <MenuItem value='30'>Last 30 days</MenuItem>
                                <MenuItem value='90'>Last 90 days</MenuItem>
                                <MenuItem value='365'>Last year</MenuItem>
                                <MenuItem value='all'>All time</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size='small' sx={{ minWidth: 160 }}>
                            <InputLabel id='user-label'>User</InputLabel>
                            <Select labelId='user-label' label='User' value={userId} onChange={handleUserChange}>
                                <MenuItem value=''>All users</MenuItem>
                                {usersQuery.data?.map(user => (
                                    <MenuItem key={user.Id} value={user.Id}>{user.Name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size='small' sx={{ minWidth: 140 }}>
                            <InputLabel id='interval-label'>Interval</InputLabel>
                            <Select labelId='interval-label' label='Interval' value={interval} onChange={handleIntervalChange}>
                                <MenuItem value={PlaybackStatsInterval.Day}>Daily</MenuItem>
                                <MenuItem value={PlaybackStatsInterval.Week}>Weekly</MenuItem>
                                <MenuItem value={PlaybackStatsInterval.Month}>Monthly</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size='small' sx={{ minWidth: 140 }}>
                            <InputLabel id='mediatype-label'>Type</InputLabel>
                            <Select labelId='mediatype-label' label='Type' value={mediaType} onChange={handleMediaTypeChange}>
                                <MenuItem value=''>All types</MenuItem>
                                {MEDIA_TYPES.map(t => (
                                    <MenuItem key={t} value={t}>{t}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>

                    {/* KPI cards */}
                    {summaryData && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 2 }}>
                            <KpiCard label='Plays' value={summaryData.Plays ?? 0} />
                            <KpiCard label='Completions' value={summaryData.Completions ?? 0} />
                            <KpiCard label='Watch time' value={formatDuration(summaryData.TotalWatchTimeTicks)} />
                            <KpiCard label='Avg / active day' value={formatDuration(summaryData.AverageDailyWatchTimeTicks)} />
                            <KpiCard label='Active days' value={summaryData.ActiveDays ?? 0} />
                            <KpiCard label='Completion rate' value={pct(summaryData.Completions, summaryData.Plays)} />
                            <KpiCard label='Transcode rate' value={pct(summaryData.TranscodedPlays, summaryData.Plays)} />
                            <KpiCard label='Avg bitrate' value={formatBitrate(summaryData.AverageBitrate)} />
                            <KpiCard label='Data transferred' value={formatBytes(summaryData.TotalDataTransferredBytes)} />
                            <KpiCard label='Unique items' value={summaryData.UniqueItems ?? 0} />
                            {!userId && <KpiCard label='Active users' value={summaryData.ActiveUsers ?? 0} />}
                        </Box>
                    )}

                    {/* Activity over time */}
                    <Paper sx={{ p: 2 }}>
                        <Typography variant='h3'>Activity over time</Typography>
                        <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                            Left axis: plays &amp; completions (count) · Right axis: watch time (hours)
                        </Typography>
                        {timeline.data && timeline.data.length > 0 ? (
                            <>
                                <LineChart
                                    height={300}
                                    xAxis={[{ scaleType: 'point', data: timeline.data.map(t => formatDate(t.Date)) }]}
                                    yAxis={[
                                        { id: 'count', label: 'Plays / completions' },
                                        { id: 'time', label: 'Watch time (h)' }
                                    ]}
                                    rightAxis='time'
                                    slotProps={{ legend: { hidden: true } }}
                                    series={[
                                        { data: timeline.data.map(t => t.Plays ?? 0), label: 'Plays', yAxisId: 'count', color: chartColor(0) },
                                        { data: timeline.data.map(t => t.Completions ?? 0), label: 'Completions', yAxisId: 'count', color: chartColor(1) },
                                        { data: timeline.data.map(t => Number(ticksToHours(t.WatchTimeTicks ?? 0).toFixed(1))), label: 'Watch time (h)', yAxisId: 'time', color: chartColor(2) }
                                    ]}
                                />
                                <ChartLegend
                                    items={[
                                        { label: 'Plays', color: chartColor(0) },
                                        { label: 'Completions', color: chartColor(1) },
                                        { label: 'Watch time (h)', color: chartColor(2) }
                                    ]}
                                />
                            </>
                        ) : (
                            <Typography color='text.secondary'>No data for this period.</Typography>
                        )}
                    </Paper>

                    {/* Direct vs transcode */}
                    {streamData && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant='h3' sx={{ mb: 1 }}>Direct play vs transcode</Typography>
                                <PieWithLegend
                                    data={[
                                        { id: 0, value: streamData.DirectPlays ?? 0, label: 'Direct', color: chartColor(0) },
                                        { id: 1, value: streamData.TranscodedPlays ?? 0, label: 'Transcode', color: chartColor(1) }
                                    ].filter(d => d.value > 0)}
                                />
                            </Paper>
                        </Box>
                    )}

                    {/* Source vs delivered, per dimension (each bar normalised to 100%) */}
                    {streamData && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
                            <SourceDeliveredBars title='Resolution' source={streamData.Resolutions} delivered={streamData.DeliveredResolutions} order={RESOLUTION_ORDER} />
                            <SourceDeliveredBars title='Video range' source={streamData.VideoRanges} delivered={streamData.DeliveredVideoRanges} />
                            <SourceDeliveredBars title='Video codec' source={streamData.VideoCodecs} delivered={streamData.DeliveredVideoCodecs} />
                            <SourceDeliveredBars title='Audio codec' source={streamData.AudioCodecs} delivered={streamData.DeliveredAudioCodecs} />
                            <SourceDeliveredBars title='Audio channels' source={streamData.AudioChannels} delivered={streamData.DeliveredAudioChannels} />
                        </Box>
                    )}

                    {/* When watched (heatmap) */}
                    <Paper sx={{ p: 2 }}>
                        <Typography variant='h3' sx={{ mb: 1 }}>When watched (plays by day & hour)</Typography>
                        <Heatmap data={heatmap.data} />
                    </Paper>

                    {/* Client / device / media-type breakdown */}
                    {contextData && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant='h3' sx={{ mb: 1 }}>By client</Typography>
                                <PieWithLegend data={toPie(contextData.Clients)} />
                            </Paper>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant='h3' sx={{ mb: 1 }}>By device</Typography>
                                <PieWithLegend data={toPie(contextData.Devices)} />
                            </Paper>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant='h3' sx={{ mb: 1 }}>By media type</Typography>
                                <PieWithLegend data={toPie(contextData.MediaTypes)} />
                            </Paper>
                        </Box>
                    )}

                    {/* Most watched */}
                    <Paper sx={{ p: 2 }}>
                        <Typography variant='h3' sx={{ mb: 1 }}>Most watched</Typography>
                        <MaterialReactTable table={itemTable} />
                    </Paper>

                    {/* Per-user (hidden when filtered to a single user) */}
                    {!userId && (
                        <Paper sx={{ p: 2 }}>
                            <Typography variant='h3' sx={{ mb: 1 }}>By user</Typography>
                            <MaterialReactTable table={userTable} />
                        </Paper>
                    )}

                    {/* Recent sessions (click a row for stream details) */}
                    <Paper sx={{ p: 2 }}>
                        <Typography variant='h3' sx={{ mb: 1 }}>Recent sessions</Typography>
                        <MaterialReactTable table={historyTable} />
                    </Paper>

                    <SessionDetailsDialog session={selectedSession} onClose={closeSession} />
                </Stack>
            </Box>
        </Page>
    );
};

Component.displayName = 'PlaybackStatisticsPage';
