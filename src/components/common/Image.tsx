import React, { type FC, useCallback, useState } from 'react';
import { BlurhashCanvas } from 'react-blurhash';

import useNearVisible from 'hooks/useNearVisible';
import * as userSettings from '../../scripts/settings/userSettings';

const imageStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    zIndex: 0
};

interface ImageProps {
    imgUrl: string;
    blurhash?: string;
    containImage: boolean;
}

const Image: FC<ImageProps> = ({
    imgUrl,
    blurhash,
    containImage
}) => {
    const [imageRef, isNearVisible] = useNearVisible<HTMLImageElement>();
    const [isLoaded, setIsLoaded] = useState(false);
    const handleLoad = useCallback(() => {
        setIsLoaded(true);
    }, []);

    const fadeinDuration = userSettings.enableFastFadein() ? '0.1s' : '0.5s';
    const transitionDuration = isLoaded ? fadeinDuration : 'none';

    return (
        <div>
            {!isLoaded && isNearVisible && blurhash && userSettings.enableBlurhash() && (
                <BlurhashCanvas
                    hash={blurhash}
                    width= {20}
                    height={20}
                    punch={1}
                    style={{
                        ...imageStyle,
                        borderRadius: '0.2em',
                        pointerEvents: 'none'
                    }}
                />
            )}
            {/* The element is always rendered so it has a box to observe; only
                the source is deferred until it comes close to the visible area. */}
            <img
                ref={imageRef}
                key={imgUrl}
                src={isNearVisible ? imgUrl : undefined}
                alt=''
                decoding='async'
                style={{
                    ...imageStyle,
                    objectFit: containImage ? 'contain' : 'cover',
                    opacity: isLoaded ? 1 : 0,
                    transition: transitionDuration
                }}
                onLoad={handleLoad}
            />

        </div>
    );
};

export default Image;
