import { beforeEach, describe, expect, it, vi } from 'vitest';

type LazyLoaderModule = typeof import('./lazyLoaderIntersectionObserver');

interface FakeObserver {
    root: Element | null;
    rootMargin: string;
    observed: Element[];
    unobserved: Element[];
    trigger: (target: Element, isIntersecting: boolean) => void;
}

let observers: FakeObserver[] = [];
let getScrollFrame: LazyLoaderModule['getScrollFrame'];
let lazyChildren: LazyLoaderModule['lazyChildren'];
let whenNearVisible: LazyLoaderModule['whenNearVisible'];

/** Replaces IntersectionObserver with a stub that records what it observes. */
function stubIntersectionObserver() {
    observers = [];

    vi.stubGlobal('IntersectionObserver', class {
        root: Element | null;
        rootMargin: string;
        observed: Element[] = [];
        unobserved: Element[] = [];

        constructor(
            private callback: (entries: unknown[], observer: unknown) => void,
            options: { root?: Element | null; rootMargin?: string } = {}
        ) {
            this.root = options.root ?? null;
            this.rootMargin = options.rootMargin ?? '0px';
            observers.push(this as unknown as FakeObserver);
        }

        observe(target: Element) {
            // A real observer ignores a target it already watches.
            if (!this.observed.includes(target)) {
                this.observed.push(target);
            }
        }

        unobserve(target: Element) {
            this.unobserved.push(target);
        }

        disconnect() { /* not used */ }

        trigger(target: Element, isIntersecting: boolean) {
            this.callback([{ target, isIntersecting }], this);
        }
    });
}

/** The observer rooted at the viewport, i.e. the one used for vertical laziness. */
const viewportObserver = () => observers.find(o => o.root === null);
const observerFor = (root: Element) => observers.find(o => o.root === root);

describe('lazyLoaderIntersectionObserver', () => {
    beforeEach(async () => {
        stubIntersectionObserver();
        document.body.innerHTML = '';

        // The module caches its shared observers, so it has to be reloaded to
        // pick up the stub and to isolate each test.
        vi.resetModules();
        ({ getScrollFrame, lazyChildren, whenNearVisible } = await import('./lazyLoaderIntersectionObserver'));
    });

    describe('getScrollFrame', () => {
        it('finds the scrolling row that clips an element', () => {
            document.body.innerHTML = `
                <div class="emby-scroller">
                    <div class="itemsContainer scrollSlider">
                        <div class="card"><div id="img" class="lazy"></div></div>
                    </div>
                </div>`;

            expect(getScrollFrame(document.getElementById('img')!))
                .toBe(document.querySelector('.emby-scroller'));
        });

        it('returns null for a grid that is only clipped by the viewport', () => {
            document.body.innerHTML = `
                <div class="itemsContainer vertical-wrap">
                    <div class="card"><div id="img" class="lazy"></div></div>
                </div>`;

            expect(getScrollFrame(document.getElementById('img')!)).toBeNull();
        });

        it('never returns the element itself, which could not be its own root', () => {
            document.body.innerHTML = '<div class="verticalSection"><div id="row" class="itemsContainer scrollX lazy"></div></div>';

            expect(getScrollFrame(document.getElementById('row')!)).toBeNull();
        });
    });

    describe('lazyChildren', () => {
        it('observes a plain grid against the viewport, with a preload margin', () => {
            document.body.innerHTML = `
                <div id="grid" class="itemsContainer vertical-wrap">
                    <div class="card"><div id="a" class="lazy"></div></div>
                    <div class="card"><div id="b" class="lazy"></div></div>
                </div>`;

            lazyChildren(document.getElementById('grid')!, vi.fn());

            const observer = viewportObserver()!;
            expect(observer.rootMargin).toBe('100%');
            expect(observer.observed).toEqual([
                document.getElementById('a'),
                document.getElementById('b')
            ]);
        });

        it('defers a row: cards are observed against the row, only once it is approached', () => {
            document.body.innerHTML = `
                <div id="section">
                    <div class="emby-scroller">
                        <div class="itemsContainer scrollSlider">
                            <div class="card"><div id="a" class="lazy"></div></div>
                            <div class="card"><div id="b" class="lazy"></div></div>
                        </div>
                    </div>
                </div>`;

            const row = document.querySelector('.emby-scroller')!;
            const callback = vi.fn();

            lazyChildren(document.getElementById('section')!, callback);

            // Only the row itself is watched up front - not a screenful of cards.
            expect(viewportObserver()!.observed).toEqual([row]);
            expect(observerFor(row)).toBeUndefined();

            viewportObserver()!.trigger(row, true);

            // Now the cards are watched against the row, so sideways scrolling
            // inside it can preload them.
            const rowObserver = observerFor(row)!;
            expect(rowObserver.rootMargin).toBe('100%');
            expect(rowObserver.observed).toEqual([
                document.getElementById('a'),
                document.getElementById('b')
            ]);
            // The row no longer needs watching.
            expect(viewportObserver()!.unobserved).toEqual([row]);

            rowObserver.trigger(document.getElementById('a')!, true);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(document.getElementById('a'));
        });

        it('reuses one observer per row across separate calls', () => {
            document.body.innerHTML = `
                <div id="section">
                    <div class="emby-scroller"><div class="itemsContainer scrollSlider">
                        <div class="card"><div id="a" class="lazy"></div></div>
                    </div></div>
                </div>`;

            const row = document.querySelector('.emby-scroller')!;
            lazyChildren(document.getElementById('section')!, vi.fn());
            viewportObserver()!.trigger(row, true);

            const observerCount = observers.length;

            document.querySelector('.scrollSlider')!.innerHTML
                += '<div class="card"><div id="c" class="lazy"></div></div>';
            lazyChildren(document.getElementById('section')!, vi.fn());
            viewportObserver()!.trigger(row, true);

            expect(observers.length).toBe(observerCount);
        });
    });

    describe('whenNearVisible', () => {
        it('waits for the row before watching an element inside it', () => {
            document.body.innerHTML = `
                <div class="emby-scroller"><div class="itemsContainer scrollSlider">
                    <div class="card"><img id="img" /></div>
                </div></div>`;

            const row = document.querySelector('.emby-scroller')!;
            const img = document.getElementById('img')!;
            const onVisible = vi.fn();

            whenNearVisible(img, onVisible);

            expect(viewportObserver()!.observed).toEqual([row]);

            viewportObserver()!.trigger(row, true);
            expect(onVisible).not.toHaveBeenCalled();

            observerFor(row)!.trigger(img, true);
            expect(onVisible).toHaveBeenCalledTimes(1);
        });

        it('only fires once, and stops observing afterwards', () => {
            document.body.innerHTML = '<div class="itemsContainer"><img id="img" /></div>';

            const img = document.getElementById('img')!;
            const onVisible = vi.fn();
            whenNearVisible(img, onVisible);

            const observer = viewportObserver()!;
            observer.trigger(img, true);
            observer.trigger(img, true);

            expect(onVisible).toHaveBeenCalledTimes(1);
            expect(observer.unobserved).toEqual([img]);
        });

        it('ignores entries that are not intersecting', () => {
            document.body.innerHTML = '<div class="itemsContainer"><img id="img" /></div>';

            const img = document.getElementById('img')!;
            const onVisible = vi.fn();
            whenNearVisible(img, onVisible);

            viewportObserver()!.trigger(img, false);
            expect(onVisible).not.toHaveBeenCalled();
        });

        it('stops observing when cancelled before becoming visible', () => {
            document.body.innerHTML = '<div class="itemsContainer"><img id="img" /></div>';

            const img = document.getElementById('img')!;
            const onVisible = vi.fn();
            const stop = whenNearVisible(img, onVisible);

            stop();
            viewportObserver()!.trigger(img, true);

            expect(onVisible).not.toHaveBeenCalled();
            expect(viewportObserver()!.unobserved).toEqual([img]);
        });
    });
});
