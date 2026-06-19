import { LogLevel } from '@jellyfin/sdk/lib/generated-client/models/log-level';
import { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import { ActivityLogSortBy } from '@jellyfin/sdk/lib/generated-client/models/activity-log-sort-by';
import FilterList from '@mui/icons-material/FilterList';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { type Theme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useInfiniteLogEntries } from 'apps/dashboard/features/activity/api/useLogEntries';
import ActivityCard from 'apps/dashboard/features/activity/components/ActivityCard';
import ActivityTableRow from 'apps/dashboard/features/activity/components/ActivityTableRow';
import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import { useUsersDetails } from 'hooks/useUsers';
import globalize from 'lib/globalize';
import { toBoolean } from 'utils/string';

const enum ActivityView {
    All = 'All',
    User = 'User',
    System = 'System'
}

const VIEW_PARAM = 'useractivity';

// Height of the fixed dense app bar; sticky filters dock just below it rather than the screen top.
const APP_BAR_HEIGHT = 48;

// Horizontal gutter matching the app bar toolbar (16px mobile / 24px desktop), so page content
// lines up with the header elements above it.
const GUTTER = { xs: 2, sm: 3 };

// Desktop table columns; `field` (when set) makes the header sortable via the server sort.
// Percentage widths (Name flexes into the remainder) keep the table fitting its container — so it
// never overflows/scrolls horizontally — while staying stable when the sort/content changes.
const COLUMNS: { label: string, field?: ActivityLogSortBy, width?: string }[] = [
    { label: 'LabelTime', field: ActivityLogSortBy.DateCreated, width: '18%' },
    { label: 'LabelLevel', field: ActivityLogSortBy.LogSeverity, width: '11%' },
    { label: 'LabelUser', field: ActivityLogSortBy.Username, width: '8%' },
    { label: 'LabelName', field: ActivityLogSortBy.Name },
    { label: 'LabelOverview', field: ActivityLogSortBy.ShortOverview, width: '20%' },
    { label: 'LabelType', field: ActivityLogSortBy.Type, width: '12%' },
    { label: '', width: '6%' }
];

const getActivityView = (param: string | null) => {
    if (param === null) return ActivityView.All;
    if (toBoolean(param)) return ActivityView.User;
    return ActivityView.System;
};

export const Component = () => {
    const [ searchParams, setSearchParams ] = useSearchParams();
    const [ activityView, setActivityView ] = useState(getActivityView(searchParams.get(VIEW_PARAM)));
    const [ severity, setSeverity ] = useState<LogLevel | ''>('');
    const [ userFilter, setUserFilter ] = useState('');
    const [ timeRange, setTimeRange ] = useState('all');
    const [ typeFilter, setTypeFilter ] = useState('');
    const [ nameSearch, setNameSearch ] = useState('');
    const [ sortField, setSortField ] = useState<ActivityLogSortBy>(ActivityLogSortBy.DateCreated);
    const [ sortDir, setSortDir ] = useState<SortOrder>(SortOrder.Descending);
    // Activity Type is a free-form string, so discover the available values from loaded entries
    // (accumulated, so a selected type's options don't vanish once filtered).
    const [ knownTypes, setKnownTypes ] = useState<string[]>([]);
    const [ showFilters, setShowFilters ] = useState(false);

    const isDesktop = useMediaQuery((t: Theme) => t.breakpoints.up('md'));
    const onToggleFilters = useCallback(() => setShowFilters(prev => !prev), []);

    const {
        usersById: users,
        names: userNames,
        isLoading: isUsersLoading,
        isError: isUsersError
    } = useUsersDetails();

    // Anchored when the range changes (so the query key is stable and doesn't refetch every render).
    const minDate = useMemo(() => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        switch (timeRange) {
            case '24h': return new Date(now - day).toISOString();
            case '7d': return new Date(now - 7 * day).toISOString();
            case '30d': return new Date(now - 30 * day).toISOString();
            default: return undefined;
        }
    }, [ timeRange ]);

    const params = useMemo(() => ({
        hasUserId: activityView !== ActivityView.All ? activityView === ActivityView.User : undefined,
        severity: severity || undefined,
        username: userFilter || undefined,
        type: typeFilter || undefined,
        name: nameSearch || undefined,
        minDate,
        sortBy: [ sortField ],
        sortOrder: [ sortDir ]
    }), [ activityView, severity, userFilter, typeFilter, nameSearch, minDate, sortField, sortDir ]);

    const {
        data,
        isLoading: isEntriesLoading,
        isError: isEntriesError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useInfiniteLogEntries(params);

    const entries = useMemo(() => (
        data?.pages.flatMap(page => page.Items ?? []) ?? []
    ), [ data ]);

    useEffect(() => {
        setKnownTypes(prev => {
            const types = new Set(prev);
            let changed = false;
            entries.forEach(entry => {
                if (entry.Type && !types.has(entry.Type)) {
                    types.add(entry.Type);
                    changed = true;
                }
            });
            return changed ? Array.from(types).sort((a, b) => a.localeCompare(b)) : prev;
        });
    }, [ entries ]);

    // Infinite scroll: a callback ref attaches the observer exactly when the sentinel mounts
    // (reliable on a fresh/hard reload, unlike a useEffect whose timing can miss the element).
    const observerRef = useRef<IntersectionObserver | null>(null);
    const sentinelRef = useCallback((node: HTMLDivElement | null) => {
        observerRef.current?.disconnect();
        if (!node) {
            return;
        }
        observerRef.current = new IntersectionObserver(observed => {
            if (observed[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
                void fetchNextPage();
            }
        }, { rootMargin: '600px' });
        observerRef.current.observe(node);
    }, [ hasNextPage, isFetchingNextPage, fetchNextPage ]);

    const onViewChange = useCallback((_e: React.MouseEvent<HTMLElement>, newView: ActivityView | null) => {
        if (newView !== null) {
            setActivityView(newView);
        }
    }, []);
    const onSeverityChange = useCallback((e: SelectChangeEvent) => setSeverity(e.target.value as LogLevel | ''), []);
    const onUserChange = useCallback((e: SelectChangeEvent) => setUserFilter(e.target.value), []);
    const onTimeRangeChange = useCallback((e: SelectChangeEvent) => setTimeRange(e.target.value), []);
    const onTypeChange = useCallback((e: SelectChangeEvent) => setTypeFilter(e.target.value), []);
    const onNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setNameSearch(e.target.value), []);

    const onSort = useCallback((field: ActivityLogSortBy) => {
        if (sortField === field) {
            setSortDir(dir => (dir === SortOrder.Descending ? SortOrder.Ascending : SortOrder.Descending));
        } else {
            setSortField(field);
            setSortDir(SortOrder.Ascending);
        }
    }, [ sortField ]);
    const sortHandler = useCallback((field: ActivityLogSortBy) => () => onSort(field), [ onSort ]);

    // Reflect the view in the URL (keeps the sidebar's user/system links in sync).
    useEffect(() => {
        const currentViewParam = getActivityView(searchParams.get(VIEW_PARAM));
        if (currentViewParam !== activityView) {
            if (activityView === ActivityView.All) {
                searchParams.delete(VIEW_PARAM);
            } else {
                searchParams.set(VIEW_PARAM, `${activityView === ActivityView.User}`);
            }
            setSearchParams(searchParams);
        }
    }, [ activityView, searchParams, setSearchParams ]);

    const isLoading = isUsersLoading || isEntriesLoading;
    const isError = isUsersError || isEntriesError;
    const sortDirection = sortDir === SortOrder.Descending ? 'desc' : 'asc';
    const activeFilters = [ nameSearch, severity, userFilter, typeFilter ].filter(Boolean).length
        + (timeRange !== 'all' ? 1 : 0);
    const filterLabel = activeFilters > 0 ?
        `${globalize.translate('Filter')} (${activeFilters})` :
        globalize.translate('Filter');

    const viewToggle = (
        <ToggleButtonGroup size='small' value={activityView} onChange={onViewChange} exclusive>
            <ToggleButton value={ActivityView.All}>{globalize.translate('All')}</ToggleButton>
            <ToggleButton value={ActivityView.User}>{globalize.translate('LabelUser')}</ToggleButton>
            <ToggleButton value={ActivityView.System}>{globalize.translate('LabelSystem')}</ToggleButton>
        </ToggleButtonGroup>
    );

    const fieldSx = { width: { xs: '100%', md: 150 } };
    const filterFields = (
        <>
            <TextField
                size='small'
                label={globalize.translate('LabelName')}
                value={nameSearch}
                onChange={onNameChange}
                sx={{ width: { xs: '100%', md: 180 } }}
            />
            <FormControl size='small' sx={fieldSx}>
                <InputLabel id='activity-time-label'>{globalize.translate('LabelTime')}</InputLabel>
                <Select labelId='activity-time-label' label={globalize.translate('LabelTime')} value={timeRange} onChange={onTimeRangeChange}>
                    <MenuItem value='all'>{globalize.translate('All')}</MenuItem>
                    <MenuItem value='24h'>{globalize.translate('Last24Hours')}</MenuItem>
                    <MenuItem value='7d'>{globalize.translate('Last7Days')}</MenuItem>
                    <MenuItem value='30d'>{globalize.translate('Last30Days')}</MenuItem>
                </Select>
            </FormControl>
            <FormControl size='small' sx={fieldSx}>
                <InputLabel id='activity-severity-label'>{globalize.translate('LabelLevel')}</InputLabel>
                <Select labelId='activity-severity-label' label={globalize.translate('LabelLevel')} value={severity} onChange={onSeverityChange}>
                    <MenuItem value=''>{globalize.translate('All')}</MenuItem>
                    {Object.values(LogLevel).map(level => (
                        <MenuItem key={level} value={level}>{globalize.translate(`LogLevel.${level}`)}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {knownTypes.length > 0 && (
                <FormControl size='small' sx={fieldSx}>
                    <InputLabel id='activity-type-label'>{globalize.translate('LabelType')}</InputLabel>
                    <Select labelId='activity-type-label' label={globalize.translate('LabelType')} value={typeFilter} onChange={onTypeChange}>
                        <MenuItem value=''>{globalize.translate('All')}</MenuItem>
                        {knownTypes.map(type => (<MenuItem key={type} value={type}>{type}</MenuItem>))}
                    </Select>
                </FormControl>
            )}
            {activityView !== ActivityView.System && (
                <FormControl size='small' sx={fieldSx}>
                    <InputLabel id='activity-user-label'>{globalize.translate('LabelUser')}</InputLabel>
                    <Select labelId='activity-user-label' label={globalize.translate('LabelUser')} value={userFilter} onChange={onUserChange}>
                        <MenuItem value=''>{globalize.translate('All')}</MenuItem>
                        {userNames.map(name => (<MenuItem key={name} value={name}>{name}</MenuItem>))}
                    </Select>
                </FormControl>
            )}
        </>
    );

    return (
        <Page
            id='serverActivityPage'
            className='mainAnimatedPage type-interior'
            title={globalize.translate('HeaderActivity')}
        >
            {/* Drop the content-primary side gutter so the sticky bar can be truly full-width;
                the gutter is re-applied to the title and content below instead. */}
            <div className='content-primary' style={{ paddingLeft: 0, paddingRight: 0 }}>
                <Stack spacing={3}>
                    <Typography variant='h1' sx={{ px: GUTTER }}>{globalize.translate('HeaderActivity')}</Typography>

                    <Box
                        sx={{
                            position: 'sticky',
                            top: APP_BAR_HEIGHT,
                            zIndex: 2,
                            bgcolor: 'background.default',
                            py: 1.5,
                            px: GUTTER,
                            borderBottom: 1,
                            borderColor: 'divider'
                        }}
                    >
                        {isDesktop ? (
                            <Stack direction='row' spacing={2} alignItems='center' flexWrap='wrap' useFlexGap>
                                {viewToggle}
                                {filterFields}
                            </Stack>
                        ) : (
                            <Stack spacing={1.5}>
                                <Stack direction='row' spacing={2} alignItems='center' justifyContent='space-between'>
                                    {viewToggle}
                                    <Button
                                        size='small'
                                        variant={activeFilters > 0 ? 'contained' : 'outlined'}
                                        startIcon={<FilterList />}
                                        onClick={onToggleFilters}
                                    >
                                        {filterLabel}
                                    </Button>
                                </Stack>
                                <Collapse in={showFilters}>
                                    <Stack spacing={2} sx={{ pt: 1 }}>
                                        {filterFields}
                                    </Stack>
                                </Collapse>
                            </Stack>
                        )}
                    </Box>

                    {isError && (
                        <Typography color='error' sx={{ px: GUTTER }}>{globalize.translate('ActivitiesLoadError')}</Typography>
                    )}

                    {isLoading ? (
                        <Loading />
                    ) : (
                        <Box sx={{ px: GUTTER }}>
                            {isDesktop ? (
                                <TableContainer>
                                    <Table size='small' sx={{ tableLayout: 'fixed' }}>
                                        <TableHead>
                                            <TableRow>
                                                {COLUMNS.map(column => (
                                                    <TableCell
                                                        key={column.label || 'actions'}
                                                        sortDirection={column.field === sortField ? sortDirection : false}
                                                        sx={{ width: column.width }}
                                                    >
                                                        {column.field ? (
                                                            <TableSortLabel
                                                                active={column.field === sortField}
                                                                direction={column.field === sortField ? sortDirection : 'asc'}
                                                                onClick={sortHandler(column.field)}
                                                            >
                                                                {globalize.translate(column.label)}
                                                            </TableSortLabel>
                                                        ) : null}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {entries.map(entry => (
                                                <ActivityTableRow
                                                    key={entry.Id}
                                                    entry={entry}
                                                    user={entry.UserId ? users[entry.UserId] : undefined}
                                                />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Stack spacing={2}>
                                    {entries.map(entry => (
                                        <ActivityCard
                                            key={entry.Id}
                                            entry={entry}
                                            user={entry.UserId ? users[entry.UserId] : undefined}
                                        />
                                    ))}
                                </Stack>
                            )}
                            {hasNextPage && <Box ref={sentinelRef} sx={{ height: 1 }} />}
                        </Box>
                    )}
                </Stack>
            </div>
        </Page>
    );
};

Component.displayName = 'ActivityPage';
