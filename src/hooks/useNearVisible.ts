import { useEffect, useRef, useState } from 'react';

import { whenNearVisible } from 'components/lazyLoader/lazyLoaderIntersectionObserver';

/**
 * Reports whether an element has come within the lazy loading preload distance
 * of the visible area, accounting for any scrolling container that clips it.
 *
 * Once true it stays true, so content is not thrown away and reloaded when it
 * scrolls back out of range.
 *
 * @returns A ref to attach to the element, and whether it is near the visible area.
 */
export function useNearVisible<T extends Element>(): [React.RefObject<T>, boolean] {
    const ref = useRef<T>(null);
    const [isNearVisible, setIsNearVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;

        if (!element || isNearVisible) {
            return;
        }

        return whenNearVisible(element, () => {
            setIsNearVisible(true);
        });
    }, [isNearVisible]);

    return [ref, isNearVisible];
}

export default useNearVisible;
