import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function usePlaylist() {
  const { data, error } = useSWR(`/api/playlist`, fetcher)

  return {
    playlist: data,
    isLoading: !error && !data,
    isError: error
  }
}