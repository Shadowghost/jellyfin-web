import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';
import { MediaStreamType } from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import type { PipelineInputs, SubtitleInput } from '../components/TranscodingPipelineGraph';
import { protocolLabel } from './getSessionStreamInfo';

const containerFromPath = (path?: string | null): string | undefined => {
    if (!path) {
        return undefined;
    }
    const ext = path.split('.').pop();
    return ext ? ext.toUpperCase() : undefined;
};

const mainContainer = (session: SessionInfoDto): string | undefined => (
    session.NowPlayingItem?.Container?.split(',')[0]?.toUpperCase() || undefined
);

/**
 * Derives the per-stream source containers (Input nodes) and the output container (Output node)
 * for the transcoding pipeline graph. External audio/subtitle streams can originate from a
 * different container (e.g. an external .mka/.mks file), which is detected via the stream path.
 */
const getSessionPipelineIo = (session: SessionInfoDto): { inputs: PipelineInputs, subtitleInput?: SubtitleInput, outputLabel?: string } => {
    const main = mainContainer(session);
    const mediaStreams = session.NowPlayingItem?.MediaStreams ?? [];

    const selectedAudioIndex = session.PlayState?.AudioStreamIndex;
    const audioStream = (selectedAudioIndex != null ?
        mediaStreams.find(s => s.Type === MediaStreamType.Audio && s.Index === selectedAudioIndex) :
        undefined)
        ?? mediaStreams.find(s => s.Type === MediaStreamType.Audio && s.IsDefault)
        ?? mediaStreams.find(s => s.Type === MediaStreamType.Audio);

    const selectedSubtitleIndex = session.PlayState?.SubtitleStreamIndex;
    const subtitleStream = selectedSubtitleIndex != null ?
        mediaStreams.find(s => s.Type === MediaStreamType.Subtitle && s.Index === selectedSubtitleIndex) :
        undefined;

    const audioContainer = audioStream?.IsExternal ?
        (containerFromPath(audioStream.Path) ?? main) :
        main;
    const subtitleContainer = subtitleStream?.IsExternal ?
        (containerFromPath(subtitleStream.Path) ?? main) :
        undefined;

    return {
        inputs: {
            video: main,
            audio: audioContainer,
            subtitle: subtitleContainer
        },
        // The subtitle source feeding a burn-in overlay (rendered only when the pipeline has a
        // subtitle/overlay stage). External subtitles carry their own container.
        subtitleInput: subtitleStream ? {
            name: (subtitleStream.Codec ?? '').toUpperCase() || undefined,
            container: subtitleContainer
        } : undefined,
        outputLabel: outputLabel(session, main)
    };
};

// The Output node shows the delivery protocol (e.g. "HLS (MP4)") when streamed via HLS/DASH,
// otherwise just the output container.
const outputLabel = (session: SessionInfoDto, main?: string): string | undefined => {
    const container = session.TranscodingInfo?.Container?.toUpperCase();
    const protocol = protocolLabel(session.TranscodingInfo?.TranscodeProtocol);
    if (protocol) {
        return container ? `${protocol} (${container})` : protocol;
    }
    return container || main;
};

export default getSessionPipelineIo;
