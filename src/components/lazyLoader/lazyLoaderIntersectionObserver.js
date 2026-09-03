/**
 * How far ahead of the visible area lazy content starts loading, as a
 * proportion of the intersection root's own size.
 */
const ROOT_MARGIN = '100%';

/**
 * Containers that clip and scroll their content, such as the horizontal card
 * rows on the home screen or a scrollable dialog body.
 *
 * An IntersectionObserver rooted at the viewport reports anything clipped by one
 * of these as not intersecting, and `rootMargin` only grows the root itself,
 * never the clip rects of intermediate ancestors. Content just outside such a
 * container therefore cannot be preloaded through the viewport observer at all -
 * it has to be observed against the container.
 */
const SCROLL_FRAME_SELECTOR = '.emby-scroller, .scrollX, .smoothScrollX, .scrollY, .smoothScrollY';

/** Observers are shared per root, so a page of cards costs a handful, not one each. */
const observersByRoot = new WeakMap();
let viewportObserver = null;

/**
 * Registered listeners, split by root kind. An element is observed against at
 * most one scroll frame - its own - so two maps are enough to keep the entries
 * of the two roots apart.
 */
const viewportListeners = new WeakMap();
const frameListeners = new WeakMap();

function handleEntries(entries, observer) {
    const listeners = observer.root ? frameListeners : viewportListeners;

    entries.forEach(entry => {
        const targetListeners = listeners.get(entry.target);

        if (!targetListeners) {
            return;
        }

        // Copied because listeners unregister themselves as they fire.
        Array.from(targetListeners).forEach(listener => {
            listener(entry);
        });
    });
}

function getObserver(root) {
    if (!root) {
        viewportObserver = viewportObserver || new IntersectionObserver(handleEntries, {
            rootMargin: ROOT_MARGIN,
            threshold: 0
        });

        return viewportObserver;
    }

    let observer = observersByRoot.get(root);

    if (!observer) {
        observer = new IntersectionObserver(handleEntries, {
            root,
            rootMargin: ROOT_MARGIN,
            threshold: 0
        });
        observersByRoot.set(root, observer);
    }

    return observer;
}

/**
 * Observes a target against a root.
 * @param {Element} target - Element to observe.
 * @param {Element|null} root - Scroll frame to observe against, or null for the viewport.
 * @param {(entry: IntersectionObserverEntry) => void} listener - Intersection handler.
 * @returns {() => void} Stops observing.
 */
function observeAgainst(target, root, listener) {
    const listeners = root ? frameListeners : viewportListeners;

    let targetListeners = listeners.get(target);

    if (!targetListeners) {
        targetListeners = new Set();
        listeners.set(target, targetListeners);
    }

    targetListeners.add(listener);
    getObserver(root).observe(target);

    return () => {
        targetListeners.delete(listener);

        if (!targetListeners.size) {
            listeners.delete(target);
            getObserver(root).unobserve(target);
        }
    };
}

/**
 * Gets the scrolling container that clips an element, if there is one.
 * @param {Element} element - Element to look up from.
 * @returns {Element|null} The clipping container, or null when the element is
 *     only clipped by the viewport.
 */
export function getScrollFrame(element) {
    // Starting at the parent so that an element which is itself a scroll frame
    // is not made the root of its own observer - such a root never intersects.
    return element.parentElement?.closest(SCROLL_FRAME_SELECTOR) ?? null;
}

/**
 * Runs a callback once an element comes within the preload distance of the
 * visible area, taking into account any scrolling container it sits in.
 *
 * An element inside a scroll frame is only observed against that frame once the
 * frame itself approaches the viewport. Observing it straight away would make
 * every row on the page load a screenful of images immediately, because a target
 * is never clipped by the intersection root it lives inside.
 *
 * @param {Element} element - Element to watch.
 * @param {() => void} onVisible - Called at most once, when the element is in range.
 * @returns {() => void} Stops watching. Safe to call after `onVisible` has run.
 */
export function whenNearVisible(element, onVisible) {
    const frame = getScrollFrame(element);
    let stop = null;

    const watch = (target, root, onIntersecting) => {
        stop = observeAgainst(target, root, entry => {
            if (entry.isIntersecting) {
                onIntersecting();
            }
        });
    };

    const watchElement = () => {
        watch(element, frame, () => {
            stop?.();
            stop = null;
            onVisible();
        });
    };

    if (frame) {
        watch(frame, null, () => {
            stop?.();
            watchElement();
        });
    } else {
        watchElement();
    }

    return () => {
        stop?.();
        stop = null;
    };
}

/**
 * Watches the lazy descendants of an element, calling back once for each as it
 * first comes within the preload distance of the visible area.
 * @param {Element} elem - Ancestor of the lazy elements.
 * @param {(element: Element) => void} callback - Called once per element.
 */
export function lazyChildren(elem, callback) {
    Array.from(elem.getElementsByClassName('lazy')).forEach(element => {
        whenNearVisible(element, () => {
            callback(element);
        });
    });
}

export default {
    getScrollFrame,
    lazyChildren,
    whenNearVisible
};
