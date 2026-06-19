import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { SessionInfo } from '@jellyfin/sdk/lib/generated-client/models/session-info';
import { PlaystateCommand } from '@jellyfin/sdk/lib/generated-client/models/playstate-command';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Pause from '@mui/icons-material/Pause';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useCallback, useMemo, useState } from 'react';

import { appRouter } from 'components/router/appRouter';
import playmethodhelper from 'components/playback/playmethodhelper';
import { useApi } from 'hooks/useApi';
import { getDeviceIcon } from 'utils/image';
import { safeDecodeURIComponent } from 'utils/url';
import globalize from 'lib/globalize';

import useEffectiveSession from '../hooks/useEffectiveSession';
import { useSendPlayStateCommand } from '../api/usePlayPauseSession';
import getNowPlayingImageUrl from '../utils/getNowPlayingImageUrl';
import getNowPlayingName from '../utils/getNowPlayingName';
import getNowPlayingPosterUrl from '../utils/getNowPlayingPosterUrl';
import getSessionNowPlayingTime from '../utils/getSessionNowPlayingTime';
import { getSessionStreamSummary } from '../utils/getSessionStreamInfo';
import isLocalAddress from '../utils/isLocalAddress';
import SessionDetails from './SessionDetails';
import SessionVolumeControl from './SessionVolumeControl';

interface SessionCardProps {
    session: SessionInfo;
    defaultExpanded?: boolean;
    /** Device identity header rendered at the top of the card. */
    header?: React.ReactNode;
}

// Poster dimensions per content shape. Movies/series are portrait, episodes are 16:9, music is
// square; sizing the box to the art's natural aspect avoids ugly cropping.
const POSTER_SHAPES = {
    portrait: { width: 120, height: 180 },
    landscape: { width: 200, height: 112 },
    square: { width: 150, height: 150 }
} as const;

const getPosterShape = (item?: BaseItemDto): keyof typeof POSTER_SHAPES => {
    switch (item?.Type) {
        case 'Audio':
        case 'MusicAlbum':
            return 'square';
        case 'Episode':
        case 'TvChannel':
        case 'Recording':
            return 'landscape';
        default:
            return 'portrait';
    }
};

interface PlaybackPosterProps {
    src?: string;
    alt: string;
    size: { width: number, height: number };
    isPaused: boolean;
    canControl: boolean;
    onTogglePlay: () => void;
}

const PlaybackPoster = ({ src, alt, size, isPaused, canControl, onTogglePlay }: PlaybackPosterProps) => {
    const overlayBase = {
        position: 'absolute' as const,
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
        color: 'common.white'
    };

    return (
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Box
                component='img'
                src={src}
                alt={alt}
                sx={{
                    width: size.width,
                    height: size.height,
                    display: 'block',
                    borderRadius: 1,
                    objectFit: 'cover',
                    bgcolor: 'rgba(255, 255, 255, 0.08)',
                    boxShadow: 4
                }}
            />
            {canControl && (
                <Box
                    onClick={onTogglePlay}
                    sx={{
                        ...overlayBase,
                        cursor: 'pointer',
                        bgcolor: isPaused ? 'rgba(0, 0, 0, 0.45)' : 'transparent',
                        opacity: isPaused ? 1 : 0,
                        transition: 'opacity .15s, background-color .15s',
                        '&:hover': { opacity: 1, bgcolor: 'rgba(0, 0, 0, 0.45)' }
                    }}
                >
                    {isPaused ? <PlayArrow sx={{ fontSize: 56 }} /> : <Pause sx={{ fontSize: 56 }} />}
                </Box>
            )}
            {!canControl && isPaused && (
                <Box sx={{ ...overlayBase, bgcolor: 'rgba(0, 0, 0, 0.45)' }}>
                    <Pause sx={{ fontSize: 48 }} />
                </Box>
            )}
        </Box>
    );
};

// Maps the display play method to a translation key and chip color.
const PLAY_METHOD_DISPLAY: Record<string, { label: string, color: 'warning' | 'info' | 'success' | 'default' }> = {
    Transcode: { label: 'Transcoding', color: 'warning' },
    DirectStream: { label: 'DirectStreaming', color: 'info' },
    DirectPlay: { label: 'DirectPlaying', color: 'success' },
    Remux: { label: 'Remuxing', color: 'info' }
};

const SessionCard = ({ session, defaultExpanded = false, header }: SessionCardProps) => {
    const [ isExpanded, setIsExpanded ] = useState(defaultExpanded);
    const { api } = useApi();
    const playStateCommand = useSendPlayStateCommand();

    const effectiveSession = useEffectiveSession(session);

    const onToggleExpand = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    const onPlayPauseSession = useCallback(() => {
        if (session.Id) {
            playStateCommand.mutate({ sessionId: session.Id, command: PlaystateCommand.PlayPause });
        }
    }, [ session, playStateCommand ]);

    const onStopSession = useCallback(() => {
        if (session.Id) {
            playStateCommand.mutate({ sessionId: session.Id, command: PlaystateCommand.Stop });
        }
    }, [ session, playStateCommand ]);

    const nowPlayingName = useMemo(() => getNowPlayingName(session), [ session ]);
    // Link the title rows to their items: for episodes/tracks the heading is the parent
    // (series/album) and the subtitle is the played item, so each links to its own page.
    const { topHref, bottomHref } = useMemo(() => {
        const item = session.NowPlayingItem;
        if (!item) {
            return { topHref: undefined, bottomHref: undefined };
        }
        const itemUrl = appRouter.getRouteUrl(item);
        const parentLink = (id?: string | null, type?: string) => (
            id ? appRouter.getRouteUrl({ Id: id, ServerId: item.ServerId, Type: type }) : undefined
        );

        // Match the heading that getNowPlayingName shows: artist for tracks, series for episodes,
        // album when there's no artist — and link it to that entity. The subtitle (the played item)
        // links to the item itself.
        let parentUrl: string | undefined;
        if (item.Artists?.length) {
            parentUrl = parentLink(item.ArtistItems?.[0]?.Id ?? item.AlbumArtists?.[0]?.Id, 'MusicArtist');
        } else if (item.SeriesName) {
            parentUrl = parentLink(item.SeriesId, 'Series');
        } else if (item.Album) {
            parentUrl = parentLink(item.AlbumId, 'MusicAlbum');
        }

        const hasParent = !!(item.Artists?.length || item.SeriesName || item.Album);
        return {
            topHref: hasParent ? (parentUrl ?? itemUrl) : itemUrl,
            bottomHref: hasParent ? itemUrl : undefined
        };
    }, [ session ]);
    const backdropImage = useMemo(() => (
        session.NowPlayingItem && getNowPlayingImageUrl(session.NowPlayingItem)
    ), [ session ]);
    const posterImage = useMemo(() => (
        session.NowPlayingItem ? getNowPlayingPosterUrl(session.NowPlayingItem) : null
    ), [ session ]);
    const runningTime = useMemo(() => getSessionNowPlayingTime(session), [ session ]);
    const deviceIcon = useMemo(() => getDeviceIcon(session), [ session ]);
    const streamRows = useMemo(() => getSessionStreamSummary(effectiveSession), [ effectiveSession ]);

    const playMethod = useMemo(() => {
        const method = playmethodhelper.getDisplayPlayMethod(session);
        return method ? PLAY_METHOD_DISPLAY[method] : undefined;
    }, [ session ]);
    const isTranscoding = useMemo(() => (
        playmethodhelper.getDisplayPlayMethod(session) === 'Transcode'
    ), [ session ]);

    // A session running in this very browser/device is the same Jellyfin session as the dashboard,
    // so remote-control commands can't drive it — don't offer controls that wouldn't work.
    // The web client's device id is base64 (so it may contain '+'/'/'); the server reports the
    // session's DeviceId percent-encoded while api.deviceInfo.id is decoded, so normalize both
    // sides before comparing, otherwise our own session isn't recognized for half of all ids.
    const ownDeviceId = api?.deviceInfo.id ? safeDecodeURIComponent(api.deviceInfo.id) : undefined;
    const isSelf = !!(ownDeviceId && session.DeviceId && ownDeviceId === safeDecodeURIComponent(session.DeviceId));
    const canControl = !isSelf && !!(session.ServerId && session.SupportsRemoteControl);
    const isPlayingMedia = !!session.NowPlayingItem;
    const isPaused = session.PlayState?.IsPaused;
    const posterSrc = posterImage || backdropImage || deviceIcon;
    const posterSize = POSTER_SHAPES[getPosterShape(session.NowPlayingItem)];

    return (
        <Card sx={{ width: '100%' }}>
            {header}

            <Box sx={{ position: 'relative', overflow: 'hidden', bgcolor: 'grey.900', color: 'common.white' }}>
                {backdropImage && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `url(${backdropImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(24px)',
                            transform: 'scale(1.15)',
                            opacity: 0.45
                        }}
                    />
                )}
                <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.5)' }} />

                <Stack direction='row' spacing={2} sx={{ position: 'relative', p: 2 }}>
                    <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                        <PlaybackPoster
                            src={posterSrc || undefined}
                            alt={nowPlayingName.topText || session.DeviceName || ''}
                            size={posterSize}
                            isPaused={!!isPaused}
                            canControl={!!canControl}
                            onTogglePlay={onPlayPauseSession}
                        />
                    </Box>

                    <Stack flexGrow={1} spacing={1} sx={{ minWidth: 0 }}>
                        <Stack direction='row' justifyContent='space-between' alignItems='flex-start' spacing={1}>
                            <Stack sx={{ minWidth: 0 }}>
                                {topHref ? (
                                    <Link
                                        href={topHref}
                                        variant='h3'
                                        underline='hover'
                                        color='inherit'
                                        noWrap
                                        title={nowPlayingName.topText}
                                    >
                                        {nowPlayingName.topText}
                                    </Link>
                                ) : (
                                    <Typography variant='h3' noWrap title={nowPlayingName.topText}>
                                        {nowPlayingName.topText}
                                    </Typography>
                                )}
                                {nowPlayingName.bottomText && (
                                    bottomHref ? (
                                        <Link
                                            href={bottomHref}
                                            variant='subtitle1'
                                            underline='hover'
                                            noWrap
                                            title={nowPlayingName.bottomText}
                                            sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
                                        >
                                            {nowPlayingName.bottomText}
                                        </Link>
                                    ) : (
                                        <Typography variant='subtitle1' sx={{ color: 'rgba(255, 255, 255, 0.7)' }} noWrap>
                                            {nowPlayingName.bottomText}
                                        </Typography>
                                    )
                                )}
                            </Stack>
                            {session.NowPlayingItem && (
                                <Stack alignItems='flex-end' spacing={0.5} sx={{ flexShrink: 0 }}>
                                    <Typography variant='body2' sx={{ whiteSpace: 'nowrap', color: 'rgba(255, 255, 255, 0.8)' }}>
                                        {runningTime.start} / {runningTime.end}
                                    </Typography>
                                    <SessionVolumeControl session={session} canControl={canControl} />
                                </Stack>
                            )}
                        </Stack>

                        {playMethod && (
                            <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                                <Chip
                                    size='small'
                                    color={playMethod.color}
                                    label={globalize.translate(playMethod.label)}
                                />
                            </Stack>
                        )}

                        {canControl && isPlayingMedia && (
                            <Stack direction='row' alignItems='center' sx={{ ml: -1 }}>
                                {/* Play/pause lives on the poster on wider screens; on mobile the
                                    poster is hidden, so surface it here next to stop. */}
                                <IconButton
                                    onClick={onPlayPauseSession}
                                    sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: 'common.white' }}
                                >
                                    {isPaused ? <PlayArrow /> : <Pause />}
                                </IconButton>
                                <IconButton
                                    onClick={onStopSession}
                                    title={globalize.translate('ButtonStop')}
                                    sx={{ color: 'common.white' }}
                                >
                                    <Stop />
                                </IconButton>
                            </Stack>
                        )}
                    </Stack>

                    {!isExpanded && streamRows.length > 0 && (
                        <>
                            <Divider
                                orientation='vertical'
                                flexItem
                                sx={{ display: { xs: 'none', md: 'block' }, borderColor: 'rgba(255, 255, 255, 0.18)' }}
                            />
                            <Stack
                                spacing={0.5}
                                justifyContent='center'
                                sx={{
                                    display: { xs: 'none', md: 'flex' },
                                    flex: '0 0 340px',
                                    minWidth: 0,
                                    color: 'rgba(255, 255, 255, 0.85)'
                                }}
                            >
                                {streamRows.map(row => (
                                    <Stack key={row.label} direction='row' spacing={1} alignItems='center'>
                                        <Typography
                                            variant='caption'
                                            sx={{ minWidth: 56, flexShrink: 0, color: 'rgba(255, 255, 255, 0.55)' }}
                                        >
                                            {row.label}
                                        </Typography>
                                        <Typography variant='caption' noWrap sx={{ flex: 1, minWidth: 0 }}>
                                            {row.source}
                                        </Typography>
                                        <ArrowForward sx={{ fontSize: 14, opacity: 0.5, flexShrink: 0 }} />
                                        <Typography variant='caption' noWrap sx={{ flex: 1, minWidth: 0 }}>
                                            {row.output}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        </>
                    )}
                </Stack>
            </Box>

            {/* Keep the progress bar when expanded for non-transcoding playback; otherwise expanding
                a direct-play session would leave no progress indicator at all. */}
            {(!isExpanded || !isTranscoding) && (session.PlayState?.PositionTicks != null && session.NowPlayingItem?.RunTimeTicks != null) && (
                <LinearProgress
                    variant='buffer'
                    value={(session.PlayState.PositionTicks / session.NowPlayingItem.RunTimeTicks) * 100}
                    valueBuffer={session.TranscodingInfo?.CompletionPercentage || 0}
                    sx={{
                        '& .MuiLinearProgress-dashed': {
                            animation: 'none',
                            backgroundImage: 'none',
                            backgroundColor: 'background.paper'
                        },
                        '& .MuiLinearProgress-bar2': {
                            backgroundColor: '#dd4919'
                        }
                    }}
                />
            )}

            {isPlayingMedia && (
                <CardActions disableSpacing sx={{ pl: 2 }}>
                    {session.RemoteEndPoint ? (
                        <Stack direction='row' spacing={2} sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant='body2' sx={{ minWidth: 120, color: 'text.secondary' }}>
                                {globalize.translate('Address')}
                            </Typography>
                            <Typography variant='body2' sx={{ color: 'text.secondary', wordBreak: 'break-word' }}>
                                {`${session.RemoteEndPoint} (${globalize.translate(isLocalAddress(session.RemoteEndPoint) ? 'Local' : 'Remote')})`}
                            </Typography>
                        </Stack>
                    ) : (
                        <Box flexGrow={1} />
                    )}
                    <IconButton
                        onClick={onToggleExpand}
                        aria-expanded={isExpanded}
                        title={globalize.translate('HeaderSession')}
                        sx={{
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: theme => theme.transitions.create('transform')
                        }}
                    >
                        <ExpandMore />
                    </IconButton>
                </CardActions>
            )}

            {isPlayingMedia && (
                <Collapse in={isExpanded} timeout='auto' unmountOnExit>
                    <Divider />
                    <CardContent>
                        <SessionDetails session={effectiveSession} />
                    </CardContent>
                </Collapse>
            )}
        </Card>
    );
};

export default SessionCard;
