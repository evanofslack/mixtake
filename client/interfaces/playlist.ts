export interface PlaylistPage {
  items?: (Playlist)[] | null;
}
export interface Playlist {
  collaborative: boolean;
  external_urls: ExternalUrls;
  href: string;
  id: string;
  images?: (ImagesEntity)[] | null;
  name: string;
  owner: AddedByOrOwner;
  public: boolean;
  snapshot_id: string;
  uri: string;
  description: string;
  followers: Followers;
  tracks: Tracks;
}
export interface ExternalUrls {
  spotify: string;
}
export interface ImagesEntity {
  height: number;
  width: number;
  url: string;
}
export interface AddedByOrOwner {
  display_name: string;
  external_urls: ExternalUrls;
  followers: Followers;
  href: string;
  id: string;
  images?: null;
  uri: string;
}
export interface Followers {
  total: number;
  href: string;
}
export interface Tracks {
  href: string;
  limit: number;
  offset: number;
  total: number;
  next: string;
  previous: string;
  items?: (ItemsEntity)[] | null;
}
export interface ItemsEntity {
  added_at: string;
  added_by: AddedByOrOwner;
  is_local: boolean;
  track: Track;
}
export interface Track {
  artists?: (ArtistsEntity)[] | null;
  available_markets?: (string | null)[] | null;
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_urls: ExternalUrls;
  href: string;
  id: string;
  name: string;
  preview_url: string;
  track_number: number;
  uri: string;
  type: string;
  album: Album;
  external_ids: ExternalIds;
  popularity: number;
  is_playable?: null;
  linked_from?: null;
}
export interface ArtistsEntity {
  name: string;
  id: string;
  uri: string;
  href: string;
  external_urls: ExternalUrls;
}
export interface Album {
  name: string;
  artists?: (ArtistsEntity)[] | null;
  album_group: string;
  album_type: string;
  id: string;
  uri: string;
  available_markets?: (string | null)[] | null;
  href: string;
  images?: (ImagesEntity)[] | null;
  external_urls: ExternalUrls;
  release_date: string;
  release_date_precision: string;
}
export interface ExternalIds {
  isrc: string;
}
