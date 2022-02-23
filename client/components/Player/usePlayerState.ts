import useSWR from "swr";
import { PlayerState } from "../../interfaces/playback";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function usePlaylist() {
    const { data, error } = useSWR(`/api/playback-state`, fetcher);
    let s: PlayerState = data;

    return {
        state: s,
        loading: !error && !data,
        error: error,
    };
}
