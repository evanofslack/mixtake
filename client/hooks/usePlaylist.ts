import useSWR from 'swr'
import {PlaylistPage} from '../interfaces/playlist'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function usePlaylist() {
    const { data, error } = useSWR(`/api/playlists`, fetcher)
    let pp: PlaylistPage = data

  return {
    playlistPage: pp,
    isLoading: !error && !data,
    isError: error
  }
}