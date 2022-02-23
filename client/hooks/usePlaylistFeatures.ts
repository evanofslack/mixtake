import useSWR from "swr";
import { Features } from "../interfaces/features";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function usePlaylist(id: string) {
    const { data, error } = useSWR(`/api/playlist-features/` + id, fetcher, {
        loadingTimeout: 5000,
    });
    let f: Features = data;

    return {
        features: f,
        loading: !error && !data,
        error: error,
    };
}
