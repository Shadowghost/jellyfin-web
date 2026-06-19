import type { SessionInfo } from '@jellyfin/sdk/lib/generated-client/models/session-info';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import { MediaStreamType } from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import { VideoRangeType } from '@jellyfin/sdk/lib/generated-client/models/video-range-type';
import { AudioSpatialFormat } from '@jellyfin/sdk/lib/generated-client/models/audio-spatial-format';
import type { TranscodingInfo } from '@jellyfin/sdk/lib/generated-client/models/transcoding-info';
import { TranscodeStageType } from '@jellyfin/sdk/lib/generated-client/models/transcode-stage-type';
import globalize from 'lib/globalize';

export interface StreamInfoRow {
    /** The localized label for the row (Stream, Video, Audio, Subtitle). */
    label: string;
    /** The source side description. */
    source: string;
    /** The output side description (what is delivered to the client). */
    output: string;
}

const VIDEO_CODEC_NAMES: Record<string, string> = {
    hevc: 'HEVC',
    h265: 'HEVC',
    h264: 'H.264',
    avc: 'H.264',
    av1: 'AV1',
    vp9: 'VP9',
    vp8: 'VP8',
    mpeg2video: 'MPEG-2',
    mpeg4: 'MPEG-4',
    vc1: 'VC-1'
};

const AUDIO_CODEC_NAMES: Record<string, string> = {
    aac: 'AAC',
    ac3: 'Dolby Digital',
    eac3: 'Dolby Digital+',
    truehd: 'Dolby TrueHD',
    dts: 'DTS',
    dca: 'DTS',
    flac: 'FLAC',
    alac: 'ALAC',
    opus: 'Opus',
    mp3: 'MP3',
    mp2: 'MP2',
    vorbis: 'Vorbis',
    pcm: 'PCM'
};

const SUBTITLE_CODEC_NAMES = new Map<string, string>([
    [ 'pgssub', 'PGS' ],
    [ 'pgs', 'PGS' ],
    [ 'hdmv_pgs_subtitle', 'PGS' ],
    [ 'subrip', 'SRT' ],
    [ 'srt', 'SRT' ],
    [ 'ass', 'ASS' ],
    [ 'ssa', 'SSA' ],
    [ 'dvdsub', 'VobSub' ],
    [ 'dvd_subtitle', 'VobSub' ],
    [ 'dvbsub', 'DVB' ],
    [ 'dvb_subtitle', 'DVB' ],
    [ 'mov_text', 'MP4 Text' ],
    [ 'webvtt', 'WebVTT' ],
    [ 'vtt', 'WebVTT' ]
]);

const codecDisplayName = (codec?: string | null): string => {
    const key = (codec ?? '').toLowerCase();
    return VIDEO_CODEC_NAMES[key] ?? AUDIO_CODEC_NAMES[key] ?? (codec ?? '').toUpperCase();
};

const formatBitrate = (bitrate?: number | null): string | null => {
    if (!bitrate) {
        return null;
    }

    if (bitrate > 1e6) {
        return `${(bitrate / 1e6).toFixed(1)} Mbps`;
    }

    return `${Math.floor(bitrate / 1e3).toLocaleString()} kbps`;
};

const withBitrate = (text: string, bitrate?: number | null): string => {
    const formatted = formatBitrate(bitrate);
    return formatted ? `${text} (${formatted})` : text;
};

/** Maps a transcode delivery protocol to a display label (HLS/DASH); null for progressive HTTP. */
export const protocolLabel = (protocol?: string | null): string | undefined => {
    switch (protocol) {
        case 'hls': return 'HLS';
        case 'dash': return 'DASH';
        default: return undefined;
    }
};

/** Coarse resolution label (4K/1080p/...) derived from the stream dimensions. */
const resolutionLabel = (stream: MediaStream): string | undefined => {
    const width = stream.Width ?? 0;
    const height = stream.Height ?? 0;
    if (!width && !height) {
        return undefined;
    }
    if (width >= 3800 || height >= 2000) return '4K';
    if (width >= 2540 || height >= 1400) return '1440p';
    if (width >= 1900 || height >= 1000) return '1080p';
    if (width >= 1260 || height >= 700) return '720p';
    if (width >= 700 || height >= 500) return '480p';
    return height ? `${height}p` : undefined;
};

/** Maps the precise HDR/Dolby Vision range to a concise label, falling back to the generic flag. */
const videoRangeLabel = (stream: MediaStream): string | undefined => {
    switch (stream.VideoRangeType) {
        case VideoRangeType.Hdr10: return 'HDR10';
        case VideoRangeType.Hdr10Plus: return 'HDR10+';
        case VideoRangeType.Hlg: return 'HLG';
        case VideoRangeType.Dovi:
        case VideoRangeType.DoviWithHdr10:
        case VideoRangeType.DoviWithHlg:
        case VideoRangeType.DoviWithSdr:
        case VideoRangeType.DoviWithEl:
        case VideoRangeType.DoviWithHdr10Plus:
        case VideoRangeType.DoviWithElhdr10Plus:
            return 'Dolby Vision';
        default: {
            const range = stream.VideoRange?.toUpperCase();
            return range && range !== 'SDR' ? range : undefined;
        }
    }
};

/** e.g. "4K HEVC 10-bit Dolby Vision". */
const getVideoDescriptor = (stream: MediaStream): string => {
    const name = codecDisplayName(stream.Codec);
    const parts = [ resolutionLabel(stream), name ];

    if (stream.BitDepth && stream.BitDepth !== 8) {
        parts.push(`${stream.BitDepth}-bit`);
    }

    parts.push(videoRangeLabel(stream));

    return parts.filter(Boolean).join(' ') || stream.DisplayTitle || name;
};

// The output side maps SDR explicitly (unlike the source descriptor) so a tone-mapping transcode
// (HDR10 -> SDR) is obvious in the Video output row.
const OUTPUT_RANGE_LABELS: Partial<Record<VideoRangeType, string>> = {
    [VideoRangeType.Sdr]: 'SDR',
    [VideoRangeType.Hdr10]: 'HDR10',
    [VideoRangeType.Hdr10Plus]: 'HDR10+',
    [VideoRangeType.Hlg]: 'HLG',
    [VideoRangeType.Dovi]: 'Dolby Vision',
    [VideoRangeType.DoviWithHdr10]: 'Dolby Vision',
    [VideoRangeType.DoviWithHlg]: 'Dolby Vision',
    [VideoRangeType.DoviWithSdr]: 'Dolby Vision',
    [VideoRangeType.DoviWithEl]: 'Dolby Vision',
    [VideoRangeType.DoviWithHdr10Plus]: 'Dolby Vision',
    [VideoRangeType.DoviWithElhdr10Plus]: 'Dolby Vision'
};

/** The transcode output video format (bit depth + range), read from the pipeline's video encode stage. */
const getOutputVideoFormat = (transcoding?: TranscodingInfo | null): string | undefined => {
    const encode = transcoding?.Pipeline?.Stages?.find(
        s => s.Type === TranscodeStageType.Encode && s.MediaType === 'Video'
    );
    if (!encode) {
        return undefined;
    }

    const parts: string[] = [];
    if (encode.VideoBitDepth) {
        parts.push(`${encode.VideoBitDepth}-bit`);
    }
    const range = encode.VideoRange ? OUTPUT_RANGE_LABELS[encode.VideoRange] : undefined;
    if (range) {
        parts.push(range);
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
};

/** e.g. "DTS:X 7.1", "Dolby TrueHD Atmos 7.1", "DTS-HD MA 5.1". */
const getAudioDescriptor = (stream: MediaStream): string => {
    const codec = (stream.Codec ?? '').toLowerCase();
    const profile = stream.Profile ?? '';
    const spatial = stream.AudioSpatialFormat;
    let name = codecDisplayName(stream.Codec);

    // Refine the DTS family using the profile / spatial format.
    if (codec === 'dts' || codec === 'dca') {
        if (spatial === AudioSpatialFormat.Dtsx || /dts[:\- ]?x/i.test(profile)) {
            name = 'DTS:X';
        } else if (/\bma\b|master/i.test(profile)) {
            name = 'DTS-HD MA';
        } else if (/hra|high.?res/i.test(profile)) {
            name = 'DTS-HD HRA';
        } else if (/\bes\b/i.test(profile)) {
            name = 'DTS-ES';
        }
    }

    const parts = [ name ];

    // Dolby Atmos rides on top of TrueHD / E-AC-3.
    if (spatial === AudioSpatialFormat.DolbyAtmos && !/atmos/i.test(name)) {
        parts.push('Atmos');
    }

    const layout = stream.ChannelLayout ?? (stream.Channels ? `${stream.Channels} ch` : undefined);
    if (layout) {
        parts.push(layout);
    }

    return parts.filter(Boolean).join(' ') || stream.DisplayTitle || name;
};

const getSubtitleDescriptor = (stream: MediaStream): string => {
    const key = (stream.Codec ?? '').toLowerCase();
    return SUBTITLE_CODEC_NAMES.get(key) ?? ((stream.Codec ?? '').toUpperCase() || stream.DisplayTitle || '');
};

/**
 * Builds a concise descriptor for a stream. MediaStream.DisplayTitle is intentionally verbose
 * (language, profile, flags, ...) which is too noisy for the source -> output rows, so we build a
 * focused codec string per stream type that still surfaces HDR/Dolby Vision and Atmos/DTS:X.
 */
const getStreamDescriptor = (stream: MediaStream): string => {
    switch (stream.Type) {
        case MediaStreamType.Video: return getVideoDescriptor(stream);
        case MediaStreamType.Audio: return getAudioDescriptor(stream);
        case MediaStreamType.Subtitle: return getSubtitleDescriptor(stream);
        default: return stream.DisplayTitle ?? (stream.Codec ?? '').toUpperCase();
    }
};

/** Maps the backend SubtitleDeliveryMethod to a display label for the output side. */
const subtitleOutputLabel = (method?: string | null): string => {
    switch (method) {
        case 'Encode': return globalize.translate('BurnIn');
        case 'Embed': return globalize.translate('Embedded');
        case 'External': return globalize.translate('MediaInfoExternal');
        case 'Hls': return 'HLS';
        default: return globalize.translate('DirectPlaying');
    }
};

interface SelectedStreams {
    transcoding: SessionInfo['TranscodingInfo'];
    videoStream?: MediaStream;
    audioStream?: MediaStream;
    subtitleStream?: MediaStream;
    videoIsDirect: boolean;
    audioIsDirect: boolean;
    sourceContainer?: string;
}

/** Resolves the played video/audio/subtitle streams and per-stream direct flags for a session. */
const selectStreams = (session: SessionInfo): SelectedStreams | null => {
    const nowPlaying = session.NowPlayingItem;
    if (!nowPlaying) {
        return null;
    }

    const transcoding = session.TranscodingInfo;

    // Each stream is direct unless an active transcode reports it as not direct. Don't gate this
    // on the overall play method: a session can copy video while transcoding audio (or vice
    // versa), in which case the play method is "DirectStream" yet one stream is still transcoded.
    const videoIsDirect = !transcoding || transcoding.IsVideoDirect === true;
    const audioIsDirect = !transcoding || transcoding.IsAudioDirect === true;

    const mediaStreams = nowPlaying.MediaStreams ?? [];
    const videoStream = mediaStreams.find(s => s.Type === MediaStreamType.Video);
    const selectedAudioIndex = session.PlayState?.AudioStreamIndex;
    const audioStream = (selectedAudioIndex != null ?
        mediaStreams.find(s => s.Type === MediaStreamType.Audio && s.Index === selectedAudioIndex) :
        undefined)
        ?? mediaStreams.find(s => s.Type === MediaStreamType.Audio && s.IsDefault)
        ?? mediaStreams.find(s => s.Type === MediaStreamType.Audio);

    const selectedSubtitleIndex = session.PlayState?.SubtitleStreamIndex;
    const subtitleStream = (selectedSubtitleIndex != null && selectedSubtitleIndex >= 0) ?
        mediaStreams.find(s => s.Type === MediaStreamType.Subtitle && s.Index === selectedSubtitleIndex) :
        undefined;

    return {
        transcoding,
        videoStream,
        audioStream,
        subtitleStream,
        videoIsDirect,
        audioIsDirect,
        sourceContainer: nowPlaying.Container?.split(',')[0]?.toUpperCase()
    };
};

/**
 * Builds the detailed "source → output" rows (full codec descriptors with bitrates) shown in the
 * expanded session view above the transcoding pipeline graph.
 */
const getSessionStreamInfo = (session: SessionInfo): StreamInfoRow[] => {
    const streams = selectStreams(session);
    if (!streams) {
        return [];
    }

    const { transcoding, videoStream, audioStream, subtitleStream, videoIsDirect, audioIsDirect, sourceContainer } = streams;
    const mediaRows: StreamInfoRow[] = [];

    // Video row.
    if (videoStream) {
        const videoFormat = getOutputVideoFormat(transcoding);
        const videoTarget = [ codecDisplayName(transcoding?.VideoCodec), videoFormat ].filter(Boolean).join(' ');
        const outputLabel = videoIsDirect ?
            withBitrate(globalize.translate('DirectPlaying'), videoStream.BitRate) :
            withBitrate(
                `${globalize.translate('Transcode')} (${videoTarget})`,
                transcoding?.VideoBitrate ?? transcoding?.Bitrate
            );

        mediaRows.push({
            label: globalize.translate('Video'),
            source: withBitrate(getStreamDescriptor(videoStream), videoStream.BitRate),
            output: outputLabel
        });
    }

    // Audio row.
    if (audioStream) {
        const outChannels = transcoding?.AudioChannels;
        const outCodec = [ codecDisplayName(transcoding?.AudioCodec), outChannels ? `${outChannels}ch` : undefined ]
            .filter(Boolean).join(' ');
        const outputLabel = audioIsDirect ?
            withBitrate(globalize.translate('DirectPlaying'), audioStream.BitRate) :
            withBitrate(`${globalize.translate('Transcode')} (${outCodec})`, transcoding?.AudioBitrate);

        mediaRows.push({
            label: globalize.translate('Audio'),
            source: withBitrate(getStreamDescriptor(audioStream), audioStream.BitRate),
            output: outputLabel
        });
    }

    // Subtitle row. Only shown when a subtitle is selected and not dropped.
    if (subtitleStream && transcoding?.SubtitleDeliveryMethod !== 'Drop') {
        mediaRows.push({
            label: globalize.translate('Subtitles'),
            source: getStreamDescriptor(subtitleStream),
            output: subtitleOutputLabel(transcoding?.SubtitleDeliveryMethod)
        });
    }

    // Stream / container row. The delivery protocol (HLS/DASH) takes precedence over the segment
    // container so the output reflects how it is actually streamed. Only shown when there is more
    // than one media stream to group — with a single stream (e.g. audio-only) it is redundant.
    // Total container bitrate is the sum of the played streams (video + selected audio).
    const sourceTotalBitrate = ((videoStream?.BitRate ?? 0) + (audioStream?.BitRate ?? 0)) || undefined;
    const outputStream = protocolLabel(transcoding?.TranscodeProtocol)
        ?? (transcoding?.Container ?? sourceContainer ?? '').toUpperCase();
    if (mediaRows.length > 1 && (sourceContainer || transcoding?.Container)) {
        return [
            {
                label: globalize.translate('LabelStream'),
                source: withBitrate(sourceContainer ?? globalize.translate('Unknown'), sourceTotalBitrate),
                output: withBitrate(outputStream, transcoding?.Bitrate ?? sourceTotalBitrate)
            },
            ...mediaRows
        ];
    }

    return mediaRows;
};

/**
 * Builds a simplified, codec-only "source → output" summary (no bitrates, resolution or HDR/Atmos
 * detail) for the at-a-glance panel on the collapsed session card.
 */
export const getSessionStreamSummary = (session: SessionInfo): StreamInfoRow[] => {
    const streams = selectStreams(session);
    if (!streams) {
        return [];
    }

    const { transcoding, videoStream, audioStream, subtitleStream, videoIsDirect, audioIsDirect, sourceContainer } = streams;
    const mediaRows: StreamInfoRow[] = [];

    if (videoStream) {
        mediaRows.push({
            label: globalize.translate('Video'),
            source: codecDisplayName(videoStream.Codec),
            output: videoIsDirect ? codecDisplayName(videoStream.Codec) : codecDisplayName(transcoding?.VideoCodec)
        });
    }

    if (audioStream) {
        mediaRows.push({
            label: globalize.translate('Audio'),
            source: codecDisplayName(audioStream.Codec),
            output: audioIsDirect ? codecDisplayName(audioStream.Codec) : codecDisplayName(transcoding?.AudioCodec)
        });
    }

    if (subtitleStream && transcoding?.SubtitleDeliveryMethod !== 'Drop') {
        mediaRows.push({
            label: globalize.translate('Subtitles'),
            source: getSubtitleDescriptor(subtitleStream),
            output: subtitleOutputLabel(transcoding?.SubtitleDeliveryMethod)
        });
    }

    // The container/Stream row is redundant when there's only one media stream (e.g. audio-only).
    const outputStream = protocolLabel(transcoding?.TranscodeProtocol)
        ?? (transcoding?.Container ?? sourceContainer ?? '').toUpperCase();
    if (mediaRows.length > 1 && (sourceContainer || transcoding?.Container)) {
        return [
            {
                label: globalize.translate('LabelStream'),
                source: sourceContainer ?? globalize.translate('Unknown'),
                output: outputStream
            },
            ...mediaRows
        ];
    }

    return mediaRows;
};

export default getSessionStreamInfo;
