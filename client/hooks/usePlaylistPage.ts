import useSWR from "swr";
import { PlaylistPage } from "../interfaces/playlist";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function usePlaylistPage() {
    const { data, error } = useSWR(`/api/playlists`, fetcher, { loadingTimeout: 10000 });
    let pp: PlaylistPage = data;

    return {
        playlistPage: pp,
        loading: !error && !data,
        error: error,
    };
}
