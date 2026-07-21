import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ServerConnections } from 'lib/jellyfin-apiclient';

const MAX_HEIGHT = 360;

/**
 * Resolves a crisp, usable poster/primary image for the now-playing item. Prefers the item's own
 * Primary image (movie poster / episode still), then the series or album poster, then a thumbnail.
 * This is distinct from getNowPlayingImageUrl which intentionally prefers a (low-res) backdrop.
 */
const getNowPlayingPosterUrl = (item: BaseItemDto): string | null => {
    if (!item.ServerId) {
        return null;
    }

    const apiClient = ServerConnections.getApiClient(item.ServerId);
    if (!apiClient) {
        return null;
    }
    const tags = item.ImageTags ?? {};

    if (item.Id && tags.Primary) {
        return apiClient.getScaledImageUrl(item.Id, { maxHeight: MAX_HEIGHT, type: ImageType.Primary, tag: tags.Primary });
    }

    if (item.SeriesId && item.SeriesPrimaryImageTag) {
        return apiClient.getScaledImageUrl(item.SeriesId, { maxHeight: MAX_HEIGHT, type: ImageType.Primary, tag: item.SeriesPrimaryImageTag });
    }

    if (item.AlbumId && item.AlbumPrimaryImageTag) {
        return apiClient.getScaledImageUrl(item.AlbumId, { maxHeight: MAX_HEIGHT, type: ImageType.Primary, tag: item.AlbumPrimaryImageTag });
    }

    if (item.Id && tags.Thumb) {
        return apiClient.getScaledImageUrl(item.Id, { maxHeight: MAX_HEIGHT, type: ImageType.Thumb, tag: tags.Thumb });
    }

    return null;
};

export default getNowPlayingPosterUrl;
