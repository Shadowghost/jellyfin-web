import { Api, Jellyfin } from '@jellyfin/sdk';
import globalAxios from 'axios';
import { ApiClient } from 'jellyfin-apiclient';

import { getCurrentLocale } from 'lib/globalize';
import { safeDecodeURIComponent } from 'utils/url';

/**
 * A shared Axios instance for SDK Api instances that injects the in-app selected
 * language as the Accept-Language header..
 */
const axiosInstance = globalAxios.create();
axiosInstance.interceptors.request.use(config => {
    const locale = getCurrentLocale();
    if (locale) {
        config.headers.set('Accept-Language', locale);
    }
    return config;
});

/**
 * Returns an SDK Api instance using the same parameters as the provided ApiClient.
 * @param {ApiClient} apiClient The (legacy) ApiClient.
 * @returns {Api} An equivalent SDK Api instance.
 */
export const toApi = (apiClient: ApiClient): Api => {
    return (new Jellyfin({
        // The SDK encodes these values when creating the authorization header,
        // so we need to decode them here to avoid double encoding.
        clientInfo: {
            name: safeDecodeURIComponent(apiClient.appName()),
            version: safeDecodeURIComponent(apiClient.appVersion())
        },
        deviceInfo: {
            name: safeDecodeURIComponent(apiClient.deviceName()),
            id: safeDecodeURIComponent(apiClient.deviceId())
        }
    })).createApi(
        apiClient.serverAddress(),
        apiClient.accessToken(),
        axiosInstance
    );
};
