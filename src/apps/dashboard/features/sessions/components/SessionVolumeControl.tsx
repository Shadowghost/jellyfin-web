import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';
import { GeneralCommandType } from '@jellyfin/sdk/lib/generated-client/models/general-command-type';
import VolumeOff from '@mui/icons-material/VolumeOff';
import VolumeUp from '@mui/icons-material/VolumeUp';
import Popover from '@mui/material/Popover';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';

import { useSendGeneralCommand } from '../api/useSendGeneralCommand';

interface SessionVolumeControlProps {
    session: SessionInfoDto;
    canControl: boolean;
}

const SessionVolumeControl = ({ session, canControl }: SessionVolumeControlProps) => {
    const sendCommand = useSendGeneralCommand();
    const [ anchorEl, setAnchorEl ] = useState<HTMLElement | null>(null);
    const [ value, setValue ] = useState(session.PlayState?.VolumeLevel ?? 100);

    const level = session.PlayState?.VolumeLevel;
    const isMuted = session.PlayState?.IsMuted;

    // Keep the slider in sync with reported volume while the popover is closed.
    useEffect(() => {
        if (!anchorEl && level != null) {
            setValue(level);
        }
    }, [ level, anchorEl ]);

    const onOpen = useCallback((e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget), []);
    const onClose = useCallback(() => setAnchorEl(null), []);

    const onChange = useCallback((_e: Event, v: number | number[]) => {
        setValue(Array.isArray(v) ? v[0] : v);
    }, []);

    const onCommit = useCallback((_e: React.SyntheticEvent | Event, v: number | number[]) => {
        const volume = Array.isArray(v) ? v[0] : v;
        if (session.Id) {
            sendCommand.mutate({
                sessionId: session.Id,
                generalCommand: {
                    Name: GeneralCommandType.SetVolume,
                    Arguments: { Volume: String(Math.round(volume)) }
                }
            });
        }
    }, [ session, sendCommand ]);

    if (level == null) {
        return null;
    }

    const display = (
        <Stack
            direction='row'
            spacing={0.5}
            alignItems='center'
            onClick={canControl ? onOpen : undefined}
            sx={{ color: 'rgba(255, 255, 255, 0.8)', cursor: canControl ? 'pointer' : 'default' }}
        >
            {isMuted ? <VolumeOff fontSize='small' /> : <VolumeUp fontSize='small' />}
            <Typography variant='body2'>{level}%</Typography>
        </Stack>
    );

    if (!canControl) {
        return display;
    }

    return (
        <>
            {display}
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={onClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Stack alignItems='center' spacing={1} sx={{ p: 2, height: 160 }}>
                    <Slider
                        orientation='vertical'
                        value={value}
                        min={0}
                        max={100}
                        onChange={onChange}
                        onChangeCommitted={onCommit}
                        aria-label='Volume'
                    />
                    <Typography variant='caption'>{Math.round(value)}%</Typography>
                </Stack>
            </Popover>
        </>
    );
};

export default SessionVolumeControl;
