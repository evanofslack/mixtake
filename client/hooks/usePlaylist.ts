import useSWR from 'swr'
import { useEffect } from 'react'
import {PlaylistPage} from '../interfaces/playlist'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function usePlaylist() {
    const { data, error } = useSWR(`/api/playlists`, fetcher)

    
    // useEffect(() => {
    //     console.log(data)
    // })

    let pp: PlaylistPage = data


  return {
    playlistPage: pp,
    isLoading: !error && !data,
    isError: error
  }
}