export function getScrollFrame(element: Element): Element | null;

export function whenNearVisible(element: Element, onVisible: () => void): () => void;

export function lazyChildren(elem: Element, callback: (element: Element) => void): void;

declare const _default: {
    getScrollFrame: typeof getScrollFrame;
    lazyChildren: typeof lazyChildren;
    whenNearVisible: typeof whenNearVisible;
};

export default _default;
