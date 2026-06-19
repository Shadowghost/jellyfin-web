import type { SessionInfo } from '@jellyfin/sdk/lib/generated-client/models/session-info';
import { MediaStreamType } from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useMemo } from 'react';

import globalize from 'lib/globalize';

import useLanguageName from '../hooks/useLanguageName';
import getSessionPipelineIo from '../utils/getSessionPipelineIo';
import SessionStreamInfo from './SessionStreamInfo';
import TranscodingPipelineGraph from './TranscodingPipelineGraph';

interface SessionDetailsProps {
    session: SessionInfo;
}

const InfoRow = ({ label, value }: { label: string, value: string }) => (
    <Stack direction='row' spacing={2}>
        <Typography variant='body2' sx={{ minWidth: 120, color: 'text.secondary' }}>{label}</Typography>
        <Typography variant='body2' sx={{ flex: 1, wordBreak: 'break-word' }}>{value}</Typography>
    </Stack>
);

// Selected stream tracks (video/audio/subtitle) by name, shown at the top of the expanded view with
// a trailing separator before the transcoding info. The name is the track title, or failing that
// its (fully-named) language — not the codec, which is shown in the transcoding info below.
const SelectedTracks = ({ session }: { session: SessionInfo }) => {
    const languageName = useLanguageName();
    const playState = session.PlayState;
    const mediaStreams = session.NowPlayingItem?.MediaStreams ?? [];

    const videoTrack = mediaStreams.find(s => s.Type === MediaStreamType.Video);
    const audioTrack = playState?.AudioStreamIndex != null ?
        mediaStreams.find(s => s.Type === MediaStreamType.Audio && s.Index === playState.AudioStreamIndex) :
        undefined;
    const subtitleTrack = (playState?.SubtitleStreamIndex != null && playState.SubtitleStreamIndex >= 0) ?
        mediaStreams.find(s => s.Type === MediaStreamType.Subtitle && s.Index === playState.SubtitleStreamIndex) :
        undefined;

    const videoName = videoTrack && (videoTrack.Title || languageName(videoTrack.Language));
    // Audio additionally surfaces its language at the end, e.g. "Commentary | English" or "English".
    const audioName = audioTrack ?
        ([ audioTrack.Title, languageName(audioTrack.Language) ].filter(Boolean).join(' | ') || undefined) :
        undefined;
    const subtitleName = subtitleTrack && (subtitleTrack.Title || languageName(subtitleTrack.Language));

    if (!videoName && !audioName && !subtitleName) {
        return null;
    }

    return (
        <>
            <Stack spacing={0.5}>
                {videoName && <InfoRow label={globalize.translate('Video')} value={videoName} />}
                {audioName && <InfoRow label={globalize.translate('Audio')} value={audioName} />}
                {subtitleName && <InfoRow label={globalize.translate('Subtitles')} value={subtitleName} />}
            </Stack>
            <Divider />
        </>
    );
};

const SessionDetails = ({ session }: SessionDetailsProps) => {
    const pipelineIo = useMemo(() => getSessionPipelineIo(session), [ session ]);
    const pipeline = session.TranscodingInfo?.Pipeline;

    return (
        <Stack spacing={3}>
            <SelectedTracks session={session} />
            <SessionStreamInfo session={session} />
            {pipeline?.Stages?.length ? (
                <TranscodingPipelineGraph
                    pipeline={pipeline}
                    inputs={pipelineIo.inputs}
                    subtitleInput={pipelineIo.subtitleInput}
                    outputLabel={pipelineIo.outputLabel}
                />
            ) : null}
        </Stack>
    );
};

export default SessionDetails;
