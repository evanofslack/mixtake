export interface User {
  display_name: string;
  external_urls: ExternalUrls;
  followers: Followers;
  href: string;
  id: string;
  images?: (ImagesEntity)[] | null;
  uri: string;
  country: string;
  email: string;
  product: string;
  birthdate: string;
}
export interface ExternalUrls {
  spotify: string;
}
export interface Followers {
  total: number;
  href: string;
}
export interface ImagesEntity {
  height: number;
  width: number;
  url: string;
}

