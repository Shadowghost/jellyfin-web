import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';
import { type ActionFunctionArgs, Form, useActionData, useNavigation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import {
    getHeroOptionsQuery,
    HERO_CONFIG_KEY,
    QUERY_KEY,
    useHeroOptions
} from 'apps/dashboard/features/hero/api/useHeroOptions';
import {
    type HeroOptions,
    HeroSourceMode
} from 'apps/dashboard/features/hero/types/heroOptions';
import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import { useApi } from 'hooks/useApi';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { queryClient } from 'utils/query/queryClient';
import type { ActionData } from 'types/actionData';

const isChecked = (value: FormDataEntryValue | undefined) => value?.toString() === 'on';

const EMPTY_GUID = '00000000000000000000000000000000';

/**
 * Normalizes a source id for the form. The server serializes guids without dashes and writes the
 * empty guid when nothing is set, neither of which is a selectable option.
 */
const toSelectableId = (sourceId: string | null | undefined) => {
    const id = sourceId?.replace(/-/g, '');

    return !id || id === EMPTY_GUID ? '' : sourceId ?? '';
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const api = ServerConnections.getApi();
    if (!api) throw new Error('No Api instance available');

    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const includeItemTypes: BaseItemKind[] = [];
    if (isChecked(data.IncludeMovies)) includeItemTypes.push(BaseItemKind.Movie);
    if (isChecked(data.IncludeSeries)) includeItemTypes.push(BaseItemKind.Series);

    const heroOptions: HeroOptions = {
        Enabled: isChecked(data.Enabled),
        Source: (data.Source?.toString() ?? HeroSourceMode.Random) as HeroSourceMode,
        // An empty string is not a guid the server can parse, and it cannot be omitted either
        // because the whole object is replaced on save. Null deserializes to the empty guid.
        SourceId: toSelectableId(data.SourceId?.toString()) || null,
        IncludeItemTypes: includeItemTypes,
        MaxItems: Number.parseInt(data.MaxItems?.toString() ?? '', 10) || 12,
        IncludeWatched: isChecked(data.IncludeWatched),
        RequireLogo: isChecked(data.RequireLogo),
        RequireOverview: isChecked(data.RequireOverview),
        EnableRemoteTrailers: isChecked(data.EnableRemoteTrailers)
    };

    await getSystemApi(api)
        .updateNamedConfiguration({
            key: HERO_CONFIG_KEY,
            body: JSON.stringify(heroOptions)
        });

    void queryClient.invalidateQueries({
        queryKey: [ QUERY_KEY ]
    });

    return {
        isSaved: true
    };
};

export const loader = async () => {
    const api = ServerConnections.getApi();
    if (!api) return {};

    return queryClient.ensureQueryData(getHeroOptionsQuery(api));
};

export const Component = () => {
    const { api, user } = useApi();
    const navigation = useNavigation();
    const actionData = useActionData() as ActionData | undefined;
    const isSubmitting = navigation.state === 'submitting';

    const {
        data: defaultHeroOptions,
        isPending,
        isError
    } = useHeroOptions();

    const [ heroOptions, setHeroOptions ] = useState(defaultHeroOptions);

    useEffect(() => {
        setHeroOptions(defaultHeroOptions);
    }, [ defaultHeroOptions ]);

    const source = heroOptions?.Source ?? HeroSourceMode.Random;
    const isCurated = source !== HeroSourceMode.Random;

    // Only the items the chosen source mode can actually point at.
    const { data: sourceItems } = useQuery({
        queryKey: [ 'HeroSourceItems', source ],
        queryFn: ({ signal }) => getLibraryApi(api!)
            .getItems(
                {
                    userId: user?.Id,
                    includeItemTypes: [
                        source === HeroSourceMode.Playlist ?
                            BaseItemKind.Playlist :
                            BaseItemKind.BoxSet
                    ],
                    recursive: true,
                    sortBy: [ 'SortName' ]
                },
                { signal }
            )
            .then(({ data }) => data.Items ?? []),
        enabled: !!api && isCurated
    });

    const setOption = useCallback(<K extends keyof HeroOptions>(key: K, value: HeroOptions[K]) => {
        setHeroOptions(current => current && { ...current, [key]: value });
    }, []);

    const onSourceChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value as HeroSourceMode;

        setHeroOptions(current => current && {
            ...current,
            Source: value,
            // A source id from the other mode would point at the wrong kind of item.
            SourceId: value === HeroSourceMode.Random ? null : current.SourceId
        });
    }, []);

    const onSourceIdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setOption('SourceId', event.target.value);
    }, [ setOption ]);

    const onMaxItemsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setOption('MaxItems', Number.parseInt(event.target.value, 10) || 0);
    }, [ setOption ]);

    const onToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        const name = event.target.name;

        if (name === 'IncludeMovies' || name === 'IncludeSeries') {
            const kind = name === 'IncludeMovies' ? BaseItemKind.Movie : BaseItemKind.Series;

            setHeroOptions(current => current && {
                ...current,
                IncludeItemTypes: checked ?
                    [ ...current.IncludeItemTypes.filter(e => e !== kind), kind ] :
                    current.IncludeItemTypes.filter(e => e !== kind)
            });

            return;
        }

        setOption(name as keyof HeroOptions, checked as never);
    }, [ setOption ]);

    if (isPending || !heroOptions) return <Loading />;

    const includesMovies = heroOptions.IncludeItemTypes.includes(BaseItemKind.Movie);
    const includesSeries = heroOptions.IncludeItemTypes.includes(BaseItemKind.Series);

    return (
        <Page
            id='heroPage'
            title={globalize.translate('HeaderHero')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Form method='POST'>
                    {isError ? (
                        <Alert severity='error'>{globalize.translate('HeroLoadError')}</Alert>
                    ) : (
                        <Stack spacing={3}>
                            <Typography variant='h1'>
                                {globalize.translate('HeaderHero')}
                            </Typography>

                            {!isSubmitting && actionData?.isSaved && (
                                <Alert severity='success'>
                                    {globalize.translate('SettingsSaved')}
                                </Alert>
                            )}

                            <FormControlLabel
                                control={
                                    <Switch
                                        name='Enabled'
                                        checked={heroOptions.Enabled}
                                        onChange={onToggle}
                                    />
                                }
                                label={globalize.translate('HeroEnabled')}
                            />

                            <TextField
                                select
                                name='Source'
                                label={globalize.translate('LabelHeroSource')}
                                helperText={globalize.translate('LabelHeroSourceHelp')}
                                value={source}
                                onChange={onSourceChange}
                            >
                                <MenuItem value={HeroSourceMode.Random}>
                                    {globalize.translate('OptionHeroSourceRandom')}
                                </MenuItem>
                                <MenuItem value={HeroSourceMode.Playlist}>
                                    {globalize.translate('OptionHeroSourcePlaylist')}
                                </MenuItem>
                                <MenuItem value={HeroSourceMode.Collection}>
                                    {globalize.translate('OptionHeroSourceCollection')}
                                </MenuItem>
                            </TextField>

                            {isCurated && (
                                <TextField
                                    select
                                    name='SourceId'
                                    label={globalize.translate('LabelHeroSourceItem')}
                                    value={toSelectableId(heroOptions.SourceId)}
                                    onChange={onSourceIdChange}
                                >
                                    {(sourceItems ?? []).map(item => (
                                        <MenuItem key={item.Id} value={item.Id ?? ''}>
                                            {item.Name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}

                            <TextField
                                type='number'
                                name='MaxItems'
                                label={globalize.translate('LabelHeroMaxItems')}
                                helperText={globalize.translate('LabelHeroMaxItemsHelp')}
                                value={heroOptions.MaxItems}
                                onChange={onMaxItemsChange}
                                slotProps={{ htmlInput: { min: 1, max: 50, step: 1 } }}
                            />

                            <FormControl component='fieldset'>
                                <FormLabel component='legend'>
                                    {globalize.translate('LabelHeroItemTypes')}
                                </FormLabel>
                                <FormGroup>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                name='IncludeMovies'
                                                checked={includesMovies}
                                                onChange={onToggle}
                                            />
                                        }
                                        label={globalize.translate('Movies')}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                name='IncludeSeries'
                                                checked={includesSeries}
                                                onChange={onToggle}
                                            />
                                        }
                                        label={globalize.translate('Shows')}
                                    />
                                </FormGroup>
                            </FormControl>

                            <FormGroup>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            name='IncludeWatched'
                                            checked={heroOptions.IncludeWatched}
                                            onChange={onToggle}
                                        />
                                    }
                                    label={globalize.translate('HeroIncludeWatched')}
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            name='RequireOverview'
                                            checked={heroOptions.RequireOverview}
                                            onChange={onToggle}
                                        />
                                    }
                                    label={globalize.translate('HeroRequireOverview')}
                                />
                            </FormGroup>

                            <FormControl>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            name='RequireLogo'
                                            checked={heroOptions.RequireLogo}
                                            onChange={onToggle}
                                        />
                                    }
                                    label={globalize.translate('HeroRequireLogo')}
                                />
                                <FormHelperText>
                                    {globalize.translate('HeroRequireLogoHelp')}
                                </FormHelperText>
                            </FormControl>

                            <FormControl>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            name='EnableRemoteTrailers'
                                            checked={heroOptions.EnableRemoteTrailers}
                                            onChange={onToggle}
                                        />
                                    }
                                    label={globalize.translate('HeroEnableRemoteTrailers')}
                                />
                                <FormHelperText>
                                    {globalize.translate('HeroEnableRemoteTrailersHelp')}
                                </FormHelperText>
                            </FormControl>

                            <Button
                                type='submit'
                                size='large'
                            >
                                {globalize.translate('Save')}
                            </Button>
                        </Stack>
                    )}
                </Form>
            </Box>
        </Page>
    );
};

Component.displayName = 'HeroPage';
