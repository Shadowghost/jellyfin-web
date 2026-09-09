import * as userSettings from 'scripts/settings/userSettings';
import focusManager from 'components/focusManager';
import hero from 'components/hero/hero';
import homeSections from 'components/homesections/homesections';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import 'elements/emby-itemscontainer/emby-itemscontainer';

class HomeTab {
    constructor(view, params) {
        this.view = view;
        this.params = params;
        this.apiClient = ServerConnections.currentApiClient();
        this.sectionsContainer = view.querySelector('.sections');
        this.heroContainer = view.querySelector('.heroSection');
        view.querySelector('.sections').addEventListener('settingschange', onHomeScreenSettingsChanged.bind(this));
    }
    onResume(options) {
        this.paused = false;

        if (this.sectionsRendered) {
            const sectionsContainer = this.sectionsContainer;

            if (this.heroContainer) {
                hero.resumeHero(this.heroContainer);
            }

            if (sectionsContainer) {
                return homeSections.resume(sectionsContainer, options);
            }

            return Promise.resolve();
        }

        const view = this.view;
        const apiClient = this.apiClient;
        this.destroyHomeSections();
        this.sectionsRendered = true;
        return apiClient.getCurrentUser()
            .then(user => {
                // The hero is the top of the page, so its request goes out before the batch of
                // section requests; queued behind them it would be the last thing to appear.
                const heroLoaded = this.heroContainer ?
                    hero.loadHero(this.heroContainer, apiClient, userSettings) :
                    Promise.resolve();

                return Promise.all([
                    heroLoaded,
                    homeSections.loadSections(view.querySelector('.sections'), apiClient, user, userSettings)
                ]);
            })
            .then(() => {
                if (options.autoFocus) {
                    focusManager.autoFocus(view);
                }
            }).catch(err => {
                console.error(err);
            });
    }
    onPause() {
        this.paused = true;

        const sectionsContainer = this.sectionsContainer;

        // Stops the hero rotating, and anything it is playing, while the tab is not showing.
        if (this.heroContainer) {
            hero.pauseHero(this.heroContainer);
        }

        if (sectionsContainer) {
            homeSections.pause(sectionsContainer);
        }
    }
    destroy() {
        this.view = null;
        this.params = null;
        this.apiClient = null;
        this.destroyHomeSections();
        this.sectionsContainer = null;
        this.heroContainer = null;
    }
    destroyHomeSections() {
        const sectionsContainer = this.sectionsContainer;

        if (this.heroContainer) {
            hero.destroyHero(this.heroContainer);
        }

        if (sectionsContainer) {
            homeSections.destroySections(sectionsContainer);
        }
    }
}

function onHomeScreenSettingsChanged() {
    this.sectionsRendered = false;

    if (!this.paused) {
        this.onResume({
            refresh: true
        });
    }
}

export default HomeTab;
