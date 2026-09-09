import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';

/** Where the hero section takes the items it shows from. */
export enum HeroSourceMode {
    Random = 'Random',
    Playlist = 'Playlist',
    Collection = 'Collection'
}

/** The server side hero options, served as the `hero` named configuration. */
export interface HeroOptions {
    Enabled: boolean;
    Source: HeroSourceMode;
    SourceId: string | null;
    IncludeItemTypes: BaseItemKind[];
    MaxItems: number;
    IncludeWatched: boolean;
    RequireLogo: boolean;
    RequireOverview: boolean;
    EnableRemoteTrailers: boolean;
}
