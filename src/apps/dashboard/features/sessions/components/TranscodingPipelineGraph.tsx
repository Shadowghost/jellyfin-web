import type { TranscodingPipelineInfo } from '@jellyfin/sdk/lib/generated-client/models/transcoding-pipeline-info';
import type { TranscodingPipelineStage } from '@jellyfin/sdk/lib/generated-client/models/transcoding-pipeline-stage';
import { HardwareFramework } from '@jellyfin/sdk/lib/generated-client/models/hardware-framework';
import { TranscodeStageType } from '@jellyfin/sdk/lib/generated-client/models/transcode-stage-type';
import { VideoRangeType } from '@jellyfin/sdk/lib/generated-client/models/video-range-type';
import type { SvgIconComponent } from '@mui/icons-material';
import BlurOn from '@mui/icons-material/BlurOn';
import Bolt from '@mui/icons-material/Bolt';
import ChangeHistory from '@mui/icons-material/ChangeHistory';
import ClosedCaption from '@mui/icons-material/ClosedCaption';
import DeveloperBoard from '@mui/icons-material/DeveloperBoard';
import Dns from '@mui/icons-material/Dns';
import Download from '@mui/icons-material/Download';
import Dvr from '@mui/icons-material/Dvr';
import GraphicEq from '@mui/icons-material/GraphicEq';
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';
import Upload from '@mui/icons-material/Upload';
import Videocam from '@mui/icons-material/Videocam';
import Memory from '@mui/icons-material/Memory';
import Tv from '@mui/icons-material/Tv';
import Whatshot from '@mui/icons-material/Whatshot';
import WebAsset from '@mui/icons-material/WebAsset';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import globalize from 'lib/globalize';

/** Per-stream source container labels (e.g. "MKV", external "MKA"/"MKS"). */
export interface PipelineInputs {
    video?: string | null;
    audio?: string | null;
    subtitle?: string | null;
}

/** The burned-in subtitle source (codec + optional external container). */
export interface SubtitleInput {
    name?: string | null;
    container?: string | null;
}

interface TranscodingPipelineGraphProps {
    pipeline?: TranscodingPipelineInfo | null;
    inputs?: PipelineInputs;
    subtitleInput?: SubtitleInput;
    /** Output container/protocol label shown on the Output node (e.g. "HLS (MP4)"). */
    outputLabel?: string | null;
}

type KeyedStage = TranscodingPipelineStage & { key: string };
type ChainKind = 'video' | 'audio';

const FRAMEWORK_LABELS: Record<HardwareFramework, string> = {
    [HardwareFramework.Software]: 'Software',
    [HardwareFramework.Qsv]: 'QuickSync',
    [HardwareFramework.Cuda]: 'CUDA',
    [HardwareFramework.Vaapi]: 'VAAPI',
    [HardwareFramework.D3D11Va]: 'D3D11VA',
    [HardwareFramework.VideoToolbox]: 'VideoToolbox',
    [HardwareFramework.Amf]: 'AMF',
    [HardwareFramework.OpenCl]: 'OpenCL',
    [HardwareFramework.Vulkan]: 'Vulkan',
    [HardwareFramework.Rkmpp]: 'RKMPP',
    [HardwareFramework.AudioToolbox]: 'AudioToolbox',
    [HardwareFramework.V4l2m2m]: 'V4L2M2M'
};

// A distinct icon per hardware framework (no vendor logos in MUI, so these are evocative proxies;
// the framework name is always shown alongside for clarity).
const FRAMEWORK_ICONS: Record<HardwareFramework, SvgIconComponent> = {
    [HardwareFramework.Software]: Memory,
    [HardwareFramework.Qsv]: DeveloperBoard,
    [HardwareFramework.Cuda]: Bolt,
    [HardwareFramework.Vaapi]: Dvr,
    [HardwareFramework.D3D11Va]: WebAsset,
    [HardwareFramework.VideoToolbox]: Tv,
    [HardwareFramework.Amf]: Whatshot,
    [HardwareFramework.OpenCl]: BlurOn,
    [HardwareFramework.Vulkan]: ChangeHistory,
    [HardwareFramework.Rkmpp]: Dns,
    [HardwareFramework.AudioToolbox]: GraphicEq,
    [HardwareFramework.V4l2m2m]: Videocam
};

// hwupload/hwdownload stages cross the software/hardware memory boundary. The generated SDK enum
// may not yet carry these values, so they are referenced by their (string) wire value; the backend
// always sends them as these literals.
const HARDWARE_UPLOAD = 'HardwareUpload';
const HARDWARE_DOWNLOAD = 'HardwareDownload';

// Keyed by string (rather than the SDK union) so the upload/download values resolve even on an SDK
// that predates them.
const STAGE_LABELS: Record<string, string> = {
    [TranscodeStageType.Unknown]: 'Stage',
    [TranscodeStageType.Decode]: 'Decode',
    [TranscodeStageType.Scale]: 'Scale',
    [TranscodeStageType.Deinterlace]: 'Deinterlace',
    [TranscodeStageType.ToneMap]: 'Tone Map',
    [TranscodeStageType.Subtitle]: 'Subtitle',
    [TranscodeStageType.Format]: 'Format',
    [TranscodeStageType.Encode]: 'Encode',
    [HARDWARE_UPLOAD]: 'Hardware Upload',
    [HARDWARE_DOWNLOAD]: 'Hardware Download'
};

// Media-type colours mirroring ffmpeg's mermaid graph (video/audio/subtitle).
const MEDIA_COLORS = {
    video: '#6eaa7b',
    audio: '#477fb3',
    subtitle: '#ad76ab'
} as const;

const getFramework = (stage: TranscodingPipelineStage): HardwareFramework => (
    stage.Framework ?? HardwareFramework.Software
);

const getFrameworkLabel = (framework: HardwareFramework): string => FRAMEWORK_LABELS[framework];

const getStageLabel = (type?: TranscodeStageType | null): string => (
    (type != null ? STAGE_LABELS[type] : undefined) ?? STAGE_LABELS[TranscodeStageType.Unknown]
);

// The node icon is normally the hardware framework's icon, but upload/download stages get a
// directional transfer icon so the software<->hardware memory copies stand out.
const getStageIcon = (stage: TranscodingPipelineStage): SvgIconComponent => {
    const type = stage.Type as string | null | undefined;
    if (type === HARDWARE_UPLOAD) {
        return Upload;
    }
    if (type === HARDWARE_DOWNLOAD) {
        return Download;
    }
    return FRAMEWORK_ICONS[getFramework(stage)];
};

const getStageTitle = (stage: TranscodingPipelineStage): string => {
    const label = getStageLabel(stage.Type);
    return stage.Name ? `${label} (${stage.Name})` : label;
};

// Concise range labels. Unlike the source stream descriptor, SDR is shown explicitly here so the
// HDR -> SDR transition (tone mapping) is obvious when comparing the decode and encode stages.
const RANGE_LABELS: Partial<Record<VideoRangeType, string>> = {
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

// The bit depth + range of a decode/encode stage, e.g. "10-bit · HDR10" or "8-bit · SDR". Shown so
// a tone-mapping transcode (HDR10 10-bit in -> SDR 8-bit out) is visible at a glance on the graph.
const getVideoFormatLabel = (stage: TranscodingPipelineStage): string | undefined => {
    const parts: string[] = [];
    if (stage.VideoBitDepth) {
        parts.push(`${stage.VideoBitDepth}-bit`);
    }
    const range = stage.VideoRange ? RANGE_LABELS[stage.VideoRange] : undefined;
    if (range) {
        parts.push(range);
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
};

const getSubtitleMergeLabel = (subtitleInput: SubtitleInput): string => {
    const base = `${globalize.translate('Subtitles')} (${subtitleInput.name})`;
    return subtitleInput.container ? `↳ ${base} · ${subtitleInput.container}` : `↳ ${base}`;
};

// Each transcode chain (video, audio) begins with a Decode stage, so a new Decode starts a new
// chain. This keeps the parallel video and audio pipelines separate.
const splitChains = (stages: KeyedStage[]): KeyedStage[][] => {
    const chains: KeyedStage[][] = [];
    let current: KeyedStage[] = [];

    for (const stage of stages) {
        if (stage.Type === TranscodeStageType.Decode && current.length > 0) {
            chains.push(current);
            current = [];
        }
        current.push(stage);
    }

    if (current.length > 0) {
        chains.push(current);
    }

    return chains;
};

// Prefer the backend-provided media type; fall back to "no video-processing stages = audio" for
// older servers that don't report it.
const getChainKind = (chain: KeyedStage[]): ChainKind => {
    const mediaType = chain[0]?.MediaType;
    if (mediaType === 'Audio') {
        return 'audio';
    }
    if (mediaType === 'Video') {
        return 'video';
    }
    const videoStageTypes: TranscodeStageType[] = [
        TranscodeStageType.Scale,
        TranscodeStageType.ToneMap,
        TranscodeStageType.Deinterlace,
        TranscodeStageType.Subtitle
    ];
    return chain.some(stage => stage.Type != null && videoStageTypes.includes(stage.Type)) ? 'video' : 'audio';
};

const hasBurnIn = (chain: KeyedStage[]) => chain.some(s => s.Type === TranscodeStageType.Subtitle);

// Rough pixel width of the horizontal layout (Input + N stages + Output, joined by connectors),
// used to decide whether it fits the available width or should fall back to the vertical stepper.
// Kept deliberately compact so common pipelines (incl. the hwupload/hwdownload nodes) stay
// horizontal at ~1080p; only genuinely narrow screens or very long chains fall back to vertical.
const NODE_WIDTH = 126;
const CONNECTOR_WIDTH = 56;
const END_NODE_WIDTH = 100;
const estimateHorizontalWidth = (chains: KeyedStage[][]): number => {
    const maxStages = chains.reduce((max, chain) => Math.max(max, chain.length), 0);
    if (maxStages === 0) {
        return 0;
    }
    return (END_NODE_WIDTH * 2) + (CONNECTOR_WIDTH * (maxStages + 1)) + (NODE_WIDTH * maxStages);
};

const FrameworkLabel = ({ framework, color }: { framework: HardwareFramework, color: string }) => {
    const Icon = FRAMEWORK_ICONS[framework];
    return (
        <Stack direction='row' spacing={0.25} alignItems='center' sx={{ color }}>
            <Icon sx={{ fontSize: '0.95rem' }} />
            <Typography variant='caption' component='span'>{getFrameworkLabel(framework)}</Typography>
        </Stack>
    );
};

/* ---------- Desktop (horizontal) ---------- */

const HConnector = ({ dashed, accent, label }: { dashed?: boolean, accent: string, label?: string | null }) => (
    <Box sx={{ flex: '1 0 56px', minWidth: 56, position: 'relative', display: 'flex', alignItems: 'center', px: 0.5 }}>
        <Box sx={{ flexGrow: 1, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${accent}` }} />
        {/* Arrowhead pointing into the next node */}
        <Box sx={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: `8px solid ${accent}` }} />
        {label && (
            <Box
                sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    maxWidth: 84,
                    px: 0.75,
                    py: 0.375,
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Typography
                    variant='caption'
                    sx={{ display: 'block', textAlign: 'center', fontSize: '0.625rem', lineHeight: 1.25, color: 'text.secondary' }}
                >
                    {label}
                </Typography>
            </Box>
        )}
    </Box>
);

const StageNode = ({ stage, accent }: { stage: KeyedStage, accent: string }) => {
    const framework = getFramework(stage);
    const Icon = getStageIcon(stage);
    const barColor = stage.Type === TranscodeStageType.Subtitle ? MEDIA_COLORS.subtitle : accent;
    const frameworkColor = stage.IsHardware ? accent : 'text.secondary';
    return (
        <Paper
            variant='outlined'
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pr: 1.5,
                py: 0.75,
                minWidth: 120,
                flexShrink: 0,
                overflow: 'hidden',
                borderColor: 'divider',
                borderLeft: `4px solid ${barColor}`,
                backgroundColor: 'background.paper'
            }}
        >
            <Box
                sx={{
                    ml: 1,
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `2px solid ${barColor}`
                }}
            >
                <Icon sx={{ fontSize: '1rem', color: frameworkColor }} />
            </Box>
            <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{getStageTitle(stage)}</Typography>
                {stage.Detail && (
                    <Typography variant='caption' component='div' color='text.secondary'>{stage.Detail}</Typography>
                )}
                {getVideoFormatLabel(stage) && (
                    <Typography variant='caption' component='div' color='text.secondary'>{getVideoFormatLabel(stage)}</Typography>
                )}
                <Typography variant='caption' component='div' sx={{ color: frameworkColor }}>{getFrameworkLabel(framework)}</Typography>
            </Box>
        </Paper>
    );
};

const SubtitleSourceNode = ({ subtitleInput }: { subtitleInput: SubtitleInput }) => (
    <Paper
        variant='outlined'
        sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pr: 1.5,
            py: 0.75,
            minWidth: 112,
            flexShrink: 0,
            borderColor: 'divider',
            borderLeft: `4px solid ${MEDIA_COLORS.subtitle}`,
            backgroundColor: 'background.paper'
        }}
    >
        <Box
            sx={{
                ml: 1,
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${MEDIA_COLORS.subtitle}`
            }}
        >
            <ClosedCaption sx={{ fontSize: '1rem', color: MEDIA_COLORS.subtitle }} />
        </Box>
        <Box sx={{ textAlign: 'left', minWidth: 0 }}>
            <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{globalize.translate('Subtitles')}</Typography>
            {subtitleInput.name && (
                <Typography variant='caption' component='div' color='text.secondary'>{subtitleInput.name}</Typography>
            )}
            {subtitleInput.container && (
                <Typography variant='caption' component='div' color='text.secondary'>{subtitleInput.container}</Typography>
            )}
        </Box>
    </Paper>
);

// A stage in the horizontal layout; a burn-in/overlay node gets the subtitle source hung below it.
const HStageCell = ({ stage, accent, subtitleInput }: { stage: KeyedStage, accent: string, subtitleInput?: SubtitleInput }) => {
    if (stage.Type !== TranscodeStageType.Subtitle || !subtitleInput?.name) {
        return <StageNode stage={stage} accent={accent} />;
    }

    return (
        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <StageNode stage={stage} accent={accent} />
            <Box sx={{ position: 'absolute', top: 'calc(100% + 2px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ height: 16, borderLeft: `2px solid ${MEDIA_COLORS.subtitle}` }} />
                <SubtitleSourceNode subtitleInput={subtitleInput} />
            </Box>
        </Box>
    );
};

// A single endpoint box (one source/output) used inside the full-height bookend columns.
const EndBox = ({ title, detail }: { title: string, detail?: string | null }) => (
    <Paper
        variant='outlined'
        sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pr: 1.5,
            py: 0.75,
            minWidth: 96,
            borderColor: 'divider',
            borderLeft: theme => `4px solid ${theme.palette.text.disabled}`,
            backgroundColor: 'background.paper'
        }}
    >
        <Box
            sx={{
                ml: 1,
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: theme => `2px solid ${theme.palette.text.disabled}`
            }}
        >
            <InsertDriveFile sx={{ fontSize: '1rem', color: 'text.secondary' }} />
        </Box>
        <Box sx={{ textAlign: 'left', minWidth: 0 }}>
            <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{title}</Typography>
            {detail && <Typography variant='caption' component='div' color='text.secondary'>{detail}</Typography>}
        </Box>
    </Paper>
);

// A full-height column of endpoint boxes (one per source, so multiple inputs stack), forming the
// left/right bookends of the pipeline.
const BookendColumn = ({ title, items }: { title: string, items: Array<string | null | undefined> }) => (
    <Box sx={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
        {items.map(detail => (
            <EndBox key={detail || title} title={title} detail={detail} />
        ))}
    </Box>
);

const HorizontalChain = ({ chain, accent, subtitleInput }: {
    chain: KeyedStage[],
    accent: string,
    subtitleInput?: SubtitleInput
}) => (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 84, pb: hasBurnIn(chain) && subtitleInput?.name ? 10 : 0 }}>
        <HConnector accent={accent} />
        {chain.map((stage, index) => (
            <React.Fragment key={stage.key}>
                {index > 0 && (
                    <HConnector
                        dashed={getFramework(chain[index - 1]) !== getFramework(stage)}
                        accent={accent}
                        label={chain[index - 1].EdgeLabel}
                    />
                )}
                <HStageCell stage={stage} accent={accent} subtitleInput={subtitleInput} />
            </React.Fragment>
        ))}
        <HConnector accent={accent} />
    </Box>
);

/* ---------- Mobile (vertical stepper) ---------- */

const StepRow = ({ icon: Icon, iconColor, railAccent, dashed, isLast, children }: {
    icon: SvgIconComponent,
    iconColor: string,
    railAccent: string,
    dashed?: boolean,
    isLast?: boolean,
    children: React.ReactNode
}) => (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <Box
                sx={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: `2px solid ${iconColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Icon sx={{ fontSize: '1.2rem', color: iconColor }} />
            </Box>
            {!isLast && <Box sx={{ flexGrow: 1, minHeight: 16, my: 0.5, borderLeft: `2px ${dashed ? 'dashed' : 'solid'} ${railAccent}` }} />}
        </Box>
        <Box sx={{ minWidth: 0, pt: 0.25, pb: isLast ? 0 : 2 }}>{children}</Box>
    </Box>
);

const Detail = ({ children }: { children: React.ReactNode }) => (
    <Typography variant='caption' component='div' color='text.secondary' sx={{ overflowWrap: 'anywhere' }}>{children}</Typography>
);

const VerticalChain = ({ chain, accent, endAccent, inputLabel, outputLabel, subtitleInput }: {
    chain: KeyedStage[],
    accent: string,
    endAccent: string,
    inputLabel?: string | null,
    outputLabel?: string | null,
    subtitleInput?: SubtitleInput
}) => {
    return (
        <Box>
            <StepRow icon={InsertDriveFile} iconColor={endAccent} railAccent={accent}>
                <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{globalize.translate('LabelInput')}</Typography>
                {inputLabel && <Detail>{inputLabel}</Detail>}
            </StepRow>

            {chain.map((stage, index) => {
                const framework = getFramework(stage);
                const isSubtitle = stage.Type === TranscodeStageType.Subtitle;
                const nextFramework = index < chain.length - 1 ? getFramework(chain[index + 1]) : null;

                let iconColor = endAccent;
                if (isSubtitle) {
                    iconColor = MEDIA_COLORS.subtitle;
                } else if (stage.IsHardware) {
                    iconColor = accent;
                }

                return (
                    <StepRow
                        key={stage.key}
                        icon={getStageIcon(stage)}
                        iconColor={iconColor}
                        railAccent={accent}
                        dashed={nextFramework != null && nextFramework !== framework}
                    >
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{getStageTitle(stage)}</Typography>
                        {stage.Detail && <Detail>{stage.Detail}</Detail>}
                        {getVideoFormatLabel(stage) && <Detail>{getVideoFormatLabel(stage)}</Detail>}
                        <Box sx={{ mt: 0.25 }}>
                            <FrameworkLabel framework={framework} color={stage.IsHardware ? accent : 'text.secondary'} />
                        </Box>
                        {isSubtitle && subtitleInput?.name && (
                            <Typography variant='caption' component='div' sx={{ color: MEDIA_COLORS.subtitle, overflowWrap: 'anywhere' }}>
                                {getSubtitleMergeLabel(subtitleInput)}
                            </Typography>
                        )}
                        {stage.EdgeLabel && <Detail>{`↓ ${stage.EdgeLabel}`}</Detail>}
                    </StepRow>
                );
            })}

            <StepRow icon={InsertDriveFile} iconColor={endAccent} railAccent={accent} isLast>
                <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{globalize.translate('LabelOutput')}</Typography>
                {outputLabel && <Detail>{outputLabel}</Detail>}
            </StepRow>
        </Box>
    );
};

const TranscodingPipelineGraph = ({ pipeline, inputs, subtitleInput, outputLabel }: TranscodingPipelineGraphProps) => {
    const theme = useTheme();
    const smallScreen = useMediaQuery(theme.breakpoints.down('sm'));

    // Measure the available width...
    const containerRef = useRef<HTMLDivElement>(null);
    const [ containerWidth, setContainerWidth ] = useState(0);
    useEffect(() => {
        const element = containerRef.current;
        if (!element) {
            return;
        }
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // ...and the actual rendered width of the horizontal graph (via a callback ref + observer, so
    // it re-measures whenever the horizontal layout mounts or its content changes).
    const [ graphWidth, setGraphWidth ] = useState(0);
    const graphObserverRef = useRef<ResizeObserver | null>(null);
    const measureGraph = useCallback((node: HTMLDivElement | null) => {
        graphObserverRef.current?.disconnect();
        graphObserverRef.current = null;
        if (node) {
            const update = () => setGraphWidth(node.scrollWidth);
            update();
            const observer = new ResizeObserver(update);
            observer.observe(node);
            graphObserverRef.current = observer;
        }
    }, []);

    const stages = useMemo<KeyedStage[]>(() => (
        (pipeline?.Stages ?? []).map((stage, index) => ({
            ...stage,
            key: `${index}-${stage.Type}-${stage.Name ?? ''}`
        }))
    ), [ pipeline ]);

    const chainInfos = useMemo(() => splitChains(stages).map(chain => {
        const kind = getChainKind(chain);
        const container = kind === 'audio' ? (inputs?.audio ?? inputs?.video) : inputs?.video;
        return { chain, kind, container };
    }), [ stages, inputs ]);

    const requiredWidth = useMemo(() => estimateHorizontalWidth(chainInfos.map(c => c.chain)), [ chainInfos ]);

    if (stages.length === 0) {
        return null;
    }

    // Use the vertical stepper whenever the horizontal graph wouldn't fit the available width.
    // Prefer the actually-measured graph width; fall back to the estimate before it's measured,
    // and to the breakpoint before the container itself is measured.
    const neededWidth = graphWidth > 0 ? graphWidth : requiredWidth;
    const vertical = containerWidth > 0 ? neededWidth > containerWidth + 2 : smallScreen;

    const endAccent = theme.palette.text.secondary;

    const chainHeading = (kind: ChainKind, accent: string) => chainInfos.length > 1 && (
        <Typography variant='subtitle2' sx={{ fontWeight: 'bold', color: accent, mb: 0.5 }}>
            {kind === 'audio' ? globalize.translate('Audio') : globalize.translate('Video')}
        </Typography>
    );

    const legend = (
        <Typography variant='caption' color='text.secondary'>
            {globalize.translate('LabelTranscodingPipelineHelp')}
        </Typography>
    );

    // Mobile / too narrow: a compact left-aligned stepper per chain (icon rail + text). The chains
    // are laid out with flex-wrap, so video and audio sit side-by-side when there's room and stack
    // vertically when there isn't.
    const verticalLayout = (
        <Stack spacing={2} sx={{ py: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, rowGap: 3, alignItems: 'flex-start' }}>
                {chainInfos.map(({ chain, kind, container }) => (
                    <Box key={chain[0].key} sx={{ flex: '1 1 240px', minWidth: 230 }}>
                        {chainHeading(kind, MEDIA_COLORS[kind])}
                        <VerticalChain
                            chain={chain}
                            accent={MEDIA_COLORS[kind]}
                            endAccent={endAccent}
                            inputLabel={container ?? inputs?.video}
                            outputLabel={outputLabel}
                            subtitleInput={subtitleInput}
                        />
                    </Box>
                ))}
            </Box>
            {legend}
        </Stack>
    );

    // Distinct input sources (a single shared container, or stacked when audio/subtitles come from
    // separate external containers).
    const inputContainers = [ ...new Set([ inputs?.video, inputs?.audio, inputs?.subtitle ].filter(Boolean)) ];

    const horizontalLayout = (
        <Stack spacing={2} sx={{ py: 1 }}>
            {/* Scroll container is a last-resort fallback while the graph width is being measured. */}
            <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
                <Box ref={measureGraph} sx={{ display: 'flex', alignItems: 'stretch', gap: 1, width: '100%' }}>
                    {/* Full-height Input bookend (stacked when there are multiple input sources) */}
                    <BookendColumn title={globalize.translate('LabelInput')} items={inputContainers} />

                    {/* Lanes grow to fill, so the Output bookend sits at the right edge (aligned with
                        the stream info card above). When the content can't fit, it overflows and the
                        component falls back to the vertical stepper. */}
                    <Stack spacing={2} sx={{ flex: '1 0 auto', alignItems: 'stretch', justifyContent: 'center' }}>
                        {chainInfos.map(({ chain, kind }) => (
                            <Box
                                key={chain[0].key}
                                sx={{ px: 2, py: 0.5, borderRadius: 2, backgroundColor: alpha(MEDIA_COLORS[kind], 0.06) }}
                            >
                                {chainHeading(kind, MEDIA_COLORS[kind])}
                                <HorizontalChain
                                    chain={chain}
                                    accent={MEDIA_COLORS[kind]}
                                    subtitleInput={subtitleInput}
                                />
                            </Box>
                        ))}
                    </Stack>

                    {/* Full-height Output bookend */}
                    <BookendColumn title={globalize.translate('LabelOutput')} items={[ outputLabel ]} />
                </Box>
            </Box>

            {legend}
        </Stack>
    );

    return (
        <Box ref={containerRef} sx={{ width: '100%' }}>
            {vertical ? verticalLayout : horizontalLayout}
        </Box>
    );
};

export default TranscodingPipelineGraph;
