export interface PlaylistPage {
  href: string;
  limit: number;
  offset: number;
  total: number;
  next: string;
  previous: string;
  items?: (Playlist)[] | null;
}
export interface Playlist {
  collaborative: boolean;
  external_urls: ExternalUrls;
  href: string;
  id: string;
  images?: (ImagesEntity)[] | null;
  name: string;
  owner: Owner;
  public: boolean;
  snapshot_id: string;
  tracks: FollowersOrTracks;
  uri: string;
}
export interface ExternalUrls {
  spotify: string;
}
export interface ImagesEntity {
  height: number;
  width: number;
  url: string;
}
export interface Owner {
  display_name: string;
  external_urls: ExternalUrls;
  followers: FollowersOrTracks;
  href: string;
  id: string;
  images?: null;
  uri: string;
}
export interface FollowersOrTracks {
  total: number;
  href: string;
}
