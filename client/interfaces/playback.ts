export interface PlayerState {
  timestamp: number;
  context: Context;
  progress_ms: number;
  is_playing: boolean;
  item: Item;
  device: Device;
  shuffle_state: boolean;
  repeat_state: string;
}
export interface Context {
  external_urls: ExternalUrls;
  href: string;
  type: string;
  uri: string;
}
export interface ExternalUrls {
  spotify: string;
}
export interface Item {
  artists?: (ArtistsEntity)[] | null;
  available_markets?: (string)[] | null;
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
  available_markets?: (string)[] | null;
  href: string;
  images?: (ImagesEntity)[] | null;
  external_urls: ExternalUrls;
  release_date: string;
  release_date_precision: string;
}
export interface ImagesEntity {
  height: number;
  width: number;
  url: string;
}
export interface ExternalIds {
  isrc: string;
}
export interface Device {
  id: string;
  is_active: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}
