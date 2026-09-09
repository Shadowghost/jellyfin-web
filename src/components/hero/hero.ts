import type { ApiClient } from 'jellyfin-apiclient';

import focusManager from 'components/focusManager';
import layoutManager from 'components/layoutManager';
import { appRouter } from 'components/router/appRouter';
import { playbackManager } from 'components/playback/playbackmanager';
import globalize from 'lib/globalize';
import datetime from 'scripts/datetime';
import type { UserSettings } from 'scripts/settings/userSettings';

import 'components/mediainfo/mediainfo.scss';
import 'elements/emby-button/emby-button';
import './hero.scss';

const ROTATE_INTERVAL_MS = 10000;
/** How far a drag has to travel before it counts as a slide change. */
const SWIPE_THRESHOLD_PX = 50;
/** How far a pointer has to move before the gesture is judged horizontal or vertical. */
const DRAG_INTENT_PX = 8;
const BACKDROP_MAX_WIDTH = 1920;
const LOGO_MAX_WIDTH = 540;

/** A trailer the server picked out for a hero item. */
interface HeroTrailer {
    Kind: 'Local' | 'Remote';
    ItemId?: string;
    Url?: string;
    Provider?: string;
    ProviderId?: string;
    Name?: string;
}

/** An item served by the hero endpoint. Deliberately narrower than BaseItemDto. */
interface HeroItem {
    Id: string;
    ServerId: string;
    Type: string;
    Name: string;
    Overview?: string | null;
    Genres: string[];
    ProductionYear?: number | null;
    OfficialRating?: string | null;
    CommunityRating?: number | null;
    CriticRating?: number | null;
    RunTimeTicks?: number | null;
    ChildCount?: number | null;
    LogoImageTag?: string | null;
    BackdropImageTags: string[];
    ThumbImageTag?: string | null;
    PrimaryImageTag?: string | null;
    Trailer?: HeroTrailer | null;
    UserData?: { IsFavorite?: boolean } | null;
}

interface HeroDrag {
    pointerId: number;
    startX: number;
    startY: number;
    /** Set once the gesture is judged horizontal, so vertical scrolls are left to the page. */
    horizontal: boolean;
}

interface HeroState {
    apiClient: ApiClient;
    items: HeroItem[];
    index: number;
    timer: number | null;
    /** Set while the pointer is over the hero or focus is inside it. */
    held: boolean;
    /** Set between pause() and resume(), i.e. while the home tab is not showing. */
    paused: boolean;
    /** Whether the hero is on screen at all; lets the scroll handlers bail without measuring. */
    onScreen: boolean;
    drag: HeroDrag | null;
    /** Set when a drag has just ended, so its release cannot also fire a button's click. */
    suppressClick: boolean;
    listeners: (() => void)[];
}

interface HeroContainer extends HTMLElement {
    heroState?: HeroState;
}

function getBackdropUrl(apiClient: ApiClient, item: HeroItem): string | null {
    if (item.BackdropImageTags.length > 0) {
        return apiClient.getScaledImageUrl(item.Id, {
            type: 'Backdrop',
            tag: item.BackdropImageTags[0],
            maxWidth: BACKDROP_MAX_WIDTH
        });
    }

    if (item.ThumbImageTag) {
        return apiClient.getScaledImageUrl(item.Id, {
            type: 'Thumb',
            tag: item.ThumbImageTag,
            maxWidth: BACKDROP_MAX_WIDTH
        });
    }

    return null;
}

function getLogoUrl(apiClient: ApiClient, item: HeroItem): string | null {
    if (!item.LogoImageTag) {
        return null;
    }

    return apiClient.getScaledImageUrl(item.Id, {
        type: 'Logo',
        tag: item.LogoImageTag,
        maxWidth: LOGO_MAX_WIDTH
    });
}

function createIcon(name: string): HTMLElement {
    const icon = document.createElement('span');
    icon.className = `material-icons ${name}`;
    icon.setAttribute('aria-hidden', 'true');

    return icon;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

/**
 * Builds the row of rating, year and length information. Mirrors what the item details page shows,
 * reusing its classes so the tomato and star icons stay in one place.
 */
function createInfoRow(item: HeroItem): HTMLElement {
    const row = createElement('div', 'heroSlideInfo mediaInfoItems');

    if (typeof item.CommunityRating === 'number') {
        const rating = createElement('div', 'starRatingContainer mediaInfoItem');
        rating.appendChild(createIcon('starIcon star'));
        rating.appendChild(document.createTextNode(item.CommunityRating.toFixed(1)));
        row.appendChild(rating);
    }

    if (typeof item.CriticRating === 'number') {
        const freshness = item.CriticRating >= 60 ? 'Fresh' : 'Rotten';
        row.appendChild(createElement(
            'div',
            `mediaInfoItem mediaInfoCriticRating mediaInfoCriticRating${freshness}`,
            String(Math.round(item.CriticRating))
        ));
    }

    if (item.ProductionYear) {
        row.appendChild(createElement('div', 'mediaInfoItem', String(item.ProductionYear)));
    }

    if (item.OfficialRating) {
        row.appendChild(createElement(
            'div',
            'mediaInfoItem mediaInfoText mediaInfoOfficialRating',
            item.OfficialRating
        ));
    }

    if (item.ChildCount) {
        const key = item.ChildCount === 1 ? 'Season' : 'TypeOptionPluralSeason';
        row.appendChild(createElement(
            'div',
            'mediaInfoItem',
            `${item.ChildCount} ${globalize.translate(key)}`
        ));
    } else if (item.RunTimeTicks) {
        row.appendChild(createElement(
            'div',
            'mediaInfoItem',
            datetime.getDisplayRunningTime(item.RunTimeTicks)
        ));
    }

    return row;
}

function createTitle(apiClient: ApiClient, item: HeroItem): HTMLElement {
    const logoUrl = getLogoUrl(apiClient, item);

    if (!logoUrl) {
        return createElement('h2', 'heroSlideTitle', item.Name);
    }

    const logo = createElement('img', 'heroSlideLogo');
    logo.src = logoUrl;
    logo.alt = item.Name;
    logo.loading = 'lazy';
    logo.draggable = false;

    const container = createElement('div', 'heroSlideLogoContainer');
    container.appendChild(logo);

    return container;
}

function createActions(state: HeroState, item: HeroItem): HTMLElement {
    const actions = createElement('div', 'heroSlideActions');

    const play = createElement('button', 'heroButton heroButtonPlay raised');
    play.type = 'button';
    play.appendChild(createIcon('play_arrow'));
    play.appendChild(createElement('span', 'heroButtonText', globalize.translate('Play')));
    play.addEventListener('click', () => {
        playbackManager.play({ ids: [item.Id], serverId: item.ServerId })
            .catch((err: unknown) => console.error('[hero] failed to play item', err));
    });
    actions.appendChild(play);

    if (item.Trailer) {
        const trailer = item.Trailer;
        const trailerButton = createElement('button', 'heroButton heroButtonTrailer raised');
        trailerButton.type = 'button';
        trailerButton.title = trailer.Name ?? globalize.translate('ButtonTrailer');
        trailerButton.appendChild(createIcon('theaters'));
        trailerButton.appendChild(
            createElement('span', 'heroButtonText', globalize.translate('ButtonTrailer')));
        trailerButton.addEventListener('click', () => {
            if (trailer.Kind === 'Local' && trailer.ItemId) {
                playbackManager.play({ ids: [trailer.ItemId], serverId: item.ServerId })
                    .catch((err: unknown) => console.error('[hero] failed to play trailer', err));
            } else if (trailer.Url) {
                window.open(trailer.Url, '_blank', 'noopener,noreferrer');
            }
        });
        actions.appendChild(trailerButton);
    }

    const details = createElement('button', 'heroButton heroButtonDetails raised');
    details.type = 'button';
    details.appendChild(createIcon('info_outline'));
    details.appendChild(
        createElement('span', 'heroButtonText', globalize.translate('ButtonInfo')));
    details.addEventListener('click', () => {
        appRouter.show(`/details?id=${item.Id}&serverId=${item.ServerId}`)
            .catch((err: unknown) => console.error('[hero] failed to show details', err));
    });
    actions.appendChild(details);

    const favorite = createElement('button', 'heroButton heroButtonFavorite');
    favorite.type = 'button';
    const favoriteIcon = createIcon('');
    favorite.appendChild(favoriteIcon);

    const setFavorite = (isFavorite: boolean) => {
        favoriteIcon.classList.toggle('favorite', isFavorite);
        favoriteIcon.classList.toggle('favorite_border', !isFavorite);
        favorite.classList.toggle('heroButtonFavoriteOn', isFavorite);
        favorite.title = globalize.translate(isFavorite ? 'Favorite' : 'AddToFavorites');
        favorite.setAttribute('aria-pressed', String(isFavorite));
    };

    setFavorite(item.UserData?.IsFavorite === true);

    favorite.addEventListener('click', () => {
        const next = item.UserData?.IsFavorite !== true;

        state.apiClient
            .updateFavoriteStatus(state.apiClient.getCurrentUserId(), item.Id, next)
            .then(() => {
                item.UserData = { ...item.UserData, IsFavorite: next };
                setFavorite(next);
            })
            .catch((err: unknown) => console.error('[hero] failed to update favorite', err));
    });
    actions.appendChild(favorite);

    return actions;
}

/**
 * Creates one of the edge chevrons. Hidden by CSS wherever the pointer is coarse, since a swipe
 * covers that case and the chevrons would only sit in the way.
 * @param container The element the hero rendered into.
 * @param direction -1 for the previous slide, 1 for the next.
 * @returns The chevron button.
 */
function createChevron(container: HeroContainer, direction: -1 | 1): HTMLElement {
    const isPrevious = direction < 0;
    const chevron = createElement(
        'button',
        `heroNav ${isPrevious ? 'heroNavPrev' : 'heroNavNext'}`
    );
    chevron.type = 'button';
    chevron.title = globalize.translate(isPrevious ? 'Previous' : 'Next');
    chevron.setAttribute('aria-label', chevron.title);
    chevron.appendChild(createIcon(isPrevious ? 'chevron_left' : 'chevron_right'));
    chevron.addEventListener('click', () => step(container, direction));

    return chevron;
}

function createSlide(state: HeroState, item: HeroItem): HTMLElement {
    const slide = createElement('div', 'heroSlide');
    slide.setAttribute('data-itemid', item.Id);

    const backdropUrl = getBackdropUrl(state.apiClient, item);
    if (backdropUrl) {
        const backdrop = createElement('img', 'heroSlideBackdrop');
        backdrop.src = backdropUrl;
        backdrop.alt = '';
        backdrop.loading = 'lazy';
        backdrop.draggable = false;
        slide.appendChild(backdrop);
    }

    slide.appendChild(createElement('div', 'heroSlideScrim'));

    const content = createElement('div', 'heroSlideContent');
    content.appendChild(createTitle(state.apiClient, item));
    content.appendChild(createInfoRow(item));

    if (item.Overview) {
        content.appendChild(createElement('p', 'heroSlideOverview', item.Overview));
    }

    if (item.Genres.length > 0) {
        content.appendChild(createElement('div', 'heroSlideGenres', item.Genres.slice(0, 3).join(' · ')));
    }

    content.appendChild(createActions(state, item));
    slide.appendChild(content);

    return slide;
}

function show(container: HeroContainer, index: number): void {
    const state = container.heroState;
    if (!state) {
        return;
    }

    const count = state.items.length;
    state.index = ((index % count) + count) % count;

    container.querySelectorAll('.heroSlide').forEach((slide, i) => {
        slide.classList.toggle('heroSlideActive', i === state.index);
        // Keeps the inactive slides out of the tab order, so a keyboard or remote never lands on a
        // button belonging to a slide nobody can see.
        slide.querySelectorAll('button').forEach(button => {
            button.tabIndex = i === state.index ? 0 : -1;
        });
    });

    container.querySelectorAll('.heroDot').forEach((dot, i) => {
        dot.classList.toggle('heroDotActive', i === state.index);
        dot.setAttribute('aria-selected', String(i === state.index));
    });
}

function stopTimer(state: HeroState): void {
    if (state.timer !== null) {
        clearInterval(state.timer);
        state.timer = null;
    }
}

function startTimer(container: HeroContainer): void {
    const state = container.heroState;
    if (!state || state.items.length < 2 || state.paused || state.held) {
        return;
    }

    stopTimer(state);
    state.timer = window.setInterval(() => show(container, state.index + 1), ROTATE_INTERVAL_MS);
}

function step(container: HeroContainer, delta: number): void {
    const state = container.heroState;
    if (!state) {
        return;
    }

    show(container, state.index + delta);
    startTimer(container);
}

function on<K extends keyof HTMLElementEventMap>(
    state: HeroState,
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
): void {
    target.addEventListener(type, listener as EventListener, options);
    state.listeners.push(() => target.removeEventListener(type, listener as EventListener, options));
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scrolls back to the hero and moves focus into it, the mirror of {@link snapPastHero}.
 * @param container The element the hero rendered into.
 * @param hero The hero element inside it.
 * @returns Whether the hero was near enough to spring back to.
 */
function springToHero(container: HeroContainer, hero: HTMLElement): boolean {
    const rect = hero.getBoundingClientRect();

    // Only while the hero is still partly on screen. Further down the page an upward gesture
    // scrolls normally until the hero comes back into view.
    if (rect.bottom <= 0 || rect.top >= 0) {
        return false;
    }

    const focusable = focusManager.getFocusableElements(hero, 1, 'noautofocus')[0] as
        HTMLElement | undefined;
    focusable?.focus({ preventScroll: true });

    container.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
    });

    return true;
}

/**
 * Scrolls the row after the hero up to the top of the screen and moves focus into it, so one
 * downward gesture leaves the hero behind rather than creeping through it.
 * @param container The element the hero rendered into.
 * @returns Whether there was anything to scroll to.
 */
function snapPastHero(container: HeroContainer): boolean {
    const next = container.parentElement?.querySelector<HTMLElement>('.sections');
    if (!next?.offsetHeight) {
        return false;
    }

    // Focus first, without scrolling, so the browser cannot land the section somewhere else; the
    // scroll below then has the last word. On TV the focus move is the point of the gesture.
    const focusable = focusManager.getFocusableElements(next, 1, 'noautofocus')[0] as
        HTMLElement | undefined;
    if (focusable) {
        focusable.focus({ preventScroll: true });
    } else if (layoutManager.tv) {
        focusManager.autoFocus(next);
    }

    next.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
    });

    return true;
}

function bindInteraction(container: HeroContainer, hero: HTMLElement): void {
    const state = container.heroState;
    if (!state) {
        return;
    }

    // Tracks visibility so the wheel handlers can bail on a boolean rather than measuring. Read
    // on every notch of a scroll, getBoundingClientRect would force layout the whole way down.
    const observer = new IntersectionObserver(entries => {
        const last = entries[entries.length - 1];
        if (last) {
            state.onScreen = last.isIntersecting;
        }
    });
    observer.observe(hero);
    state.listeners.push(() => observer.disconnect());

    const hold = (held: boolean) => {
        state.held = held;

        if (held) {
            stopTimer(state);
        } else {
            startTimer(container);
        }
    };

    on(state, hero, 'pointerenter', () => hold(true));
    on(state, hero, 'pointerleave', () => hold(false));
    on(state, hero, 'focusin', () => hold(true));
    on(state, hero, 'focusout', () => hold(false));

    on(state, hero, 'keydown', event => {
        if (event.key === 'ArrowLeft') {
            step(container, -1);
        } else if (event.key === 'ArrowRight') {
            step(container, 1);
        } else if (event.key === 'ArrowDown') {
            if (!snapPastHero(container)) {
                return;
            }
        } else {
            return;
        }

        event.preventDefault();
    });

    // One downward notch anywhere over the hero jumps past it instead of scrolling through it.
    // Only while the hero still dominates the screen, so a second notch scrolls normally rather
    // than snapping back to the same place.
    on(state, hero, 'wheel', event => {
        if (event.deltaY <= 0
            || hero.getBoundingClientRect().bottom <= window.innerHeight / 2) {
            return;
        }

        if (snapPastHero(container)) {
            event.preventDefault();
        }
    }, { passive: false });

    // Upward gestures happen with the pointer over the rows, not the hero, so they bind to the
    // tab that holds both.
    const tab = container.parentElement;
    if (tab) {
        on(state, tab, 'wheel', event => {
            if (event.deltaY >= 0 || !state.onScreen) {
                return;
            }

            if (springToHero(container, hero)) {
                event.preventDefault();
            }
        }, { passive: false });

        on(state, tab, 'keydown', event => {
            // Leaves Up alone deeper in the page, where the hero is out of view, and inside the
            // hero itself, where there is nothing above to go to.
            if (event.key !== 'ArrowUp' || !state.onScreen
                || hero.contains(event.target as Node)) {
                return;
            }

            if (springToHero(container, hero)) {
                event.preventDefault();
            }
        });
    }

    // Pointer events rather than touch events, so a finger swipe and a mouse drag are the same
    // gesture. Vertical movement is handed back to the page, which is what touch-action: pan-y
    // lets the browser do natively.
    on(state, hero, 'pointerdown', event => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
        }

        state.drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            horizontal: false
        };
    });

    on(state, hero, 'pointermove', event => {
        const drag = state.drag;
        if (!drag || event.pointerId !== drag.pointerId || drag.horizontal) {
            return;
        }

        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;

        if (Math.abs(deltaX) < DRAG_INTENT_PX && Math.abs(deltaY) < DRAG_INTENT_PX) {
            return;
        }

        if (Math.abs(deltaY) > Math.abs(deltaX)) {
            // The page is being scrolled, not the hero dragged.
            state.drag = null;
            return;
        }

        drag.horizontal = true;
        hero.classList.add('heroDragging');
        // Only now, so a plain click on a button is never redirected away from it.
        hero.setPointerCapture(drag.pointerId);
    });

    const endDrag = (event: PointerEvent, commit: boolean) => {
        const drag = state.drag;
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        state.drag = null;
        state.suppressClick = drag.horizontal;
        hero.classList.remove('heroDragging');

        if (!commit || !drag.horizontal) {
            return;
        }

        const deltaX = event.clientX - drag.startX;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
            step(container, deltaX < 0 ? 1 : -1);
        }
    };

    on(state, hero, 'pointerup', event => endDrag(event, true));
    on(state, hero, 'pointercancel', event => endDrag(event, false));

    // A drag that started on Play must not also press it on release.
    on(state, hero, 'click', event => {
        if (!state.suppressClick) {
            return;
        }

        state.suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, { capture: true });
}

function render(container: HeroContainer, items: HeroItem[]): void {
    const state = container.heroState;
    if (!state) {
        return;
    }

    state.items = items;

    const hero = createElement('div', 'hero');
    hero.tabIndex = -1;

    const slides = createElement('div', 'heroSlides');
    items.forEach(item => {
        slides.appendChild(createSlide(state, item));
    });
    hero.appendChild(slides);

    if (items.length > 1) {
        hero.appendChild(createChevron(container, -1));
        hero.appendChild(createChevron(container, 1));

        const dots = createElement('div', 'heroDots');
        dots.setAttribute('role', 'tablist');

        items.forEach((item, index) => {
            const dot = createElement('button', 'heroDot');
            dot.type = 'button';
            dot.setAttribute('role', 'tab');
            dot.title = item.Name;
            dot.addEventListener('click', () => {
                show(container, index);
                startTimer(container);
            });
            dots.appendChild(dot);
        });

        hero.appendChild(dots);
    }

    container.innerHTML = '';
    container.appendChild(hero);
    container.classList.add('heroSectionLoaded');

    bindInteraction(container, hero);
    show(container, 0);
    startTimer(container);
}

/**
 * Loads the hero section into a container, or leaves it empty when the user turned it off, the
 * server has it disabled or nothing in the user's libraries qualifies.
 * @param container The element the hero renders into.
 * @param apiClient The api client for the current server.
 * @param userSettings The current user settings.
 * @returns A promise that resolves once the hero has rendered.
 */
export async function loadHero(
    container: HeroContainer,
    apiClient: ApiClient,
    userSettings: UserSettings
): Promise<void> {
    destroyHero(container);

    if (!userSettings.enableHero()) {
        return;
    }

    // Holds the hero's space open while it loads, so the rows below do not jump down when it
    // arrives. Cleared either way, which collapses the section again if nothing qualifies.
    container.classList.add('heroSectionPending');

    let items: HeroItem[];
    try {
        items = await apiClient.getJSON(apiClient.getUrl('Items/Hero')) as HeroItem[];
    } catch (err) {
        console.error('[hero] failed to load hero items', err);
        return;
    } finally {
        container.classList.remove('heroSectionPending');
    }

    if (!items?.length) {
        return;
    }

    container.heroState = {
        apiClient,
        items: [],
        index: 0,
        timer: null,
        held: false,
        paused: false,
        onScreen: true,
        drag: null,
        suppressClick: false,
        listeners: []
    };

    render(container, items);
}

/**
 * Stops the hero rotating, for when the home tab is no longer showing.
 * @param container The element the hero rendered into.
 */
export function pauseHero(container: HeroContainer): void {
    const state = container.heroState;
    if (!state) {
        return;
    }

    state.paused = true;
    stopTimer(state);
}

/**
 * Starts the hero rotating again after {@link pauseHero}.
 * @param container The element the hero rendered into.
 */
export function resumeHero(container: HeroContainer): void {
    const state = container.heroState;
    if (!state) {
        return;
    }

    state.paused = false;
    startTimer(container);
}

/**
 * Tears the hero down and releases everything it holds.
 * @param container The element the hero rendered into.
 */
export function destroyHero(container: HeroContainer): void {
    const state = container.heroState;

    if (state) {
        stopTimer(state);
        state.listeners.forEach(remove => {
            remove();
        });
        state.listeners = [];
        state.items = [];
    }

    delete container.heroState;
    container.innerHTML = '';
    container.classList.remove('heroSectionLoaded', 'heroSectionPending');
}

export default {
    loadHero,
    pauseHero,
    resumeHero,
    destroyHero
};
