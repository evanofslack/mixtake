import useSWR from "swr";
import { Playlist } from "../interfaces/playlist";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function usePlaylist(id: string) {
    const { data, error } = useSWR(`/api/playlist/` + id, fetcher, { loadingTimeout: 5000 });
    let p: Playlist = data;

    return {
        playlist: p,
        loading: !error && !data,
        error: error,
    };
}
