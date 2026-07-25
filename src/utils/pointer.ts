/**
 * Matches when the primary pointing device is precise (mouse/trackpad).
 * Touch-first devices report a "coarse" primary pointer even when a pointer
 * device is attached, making this a better signal than touch capability for
 * mouse-only affordances.
 */
export const FINE_POINTER_MEDIA_QUERY = '(pointer: fine)';

export const hasFinePointer = () => window.matchMedia(FINE_POINTER_MEDIA_QUERY).matches;
