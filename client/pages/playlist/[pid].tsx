import { useRouter } from 'next/router'
import usePlaylist from '../../hooks/usePlaylist'
import PlaylistCard from '../../components/PlaylistCard'
import FeatureBurst from '../../components/FeatureBurst'

function Playlist() {
  const router = useRouter()
  const { pid } = router.query
  if (typeof pid != "string") {
    return <div>Error getting path parameter</div>
  }

  const { playlist, loading, error } = usePlaylist(pid)
  

  if (loading) return <div>Loading</div>;

  if (error) return <div>An error has occurred</div>;

  return (
    <div>
      <PlaylistCard playlist={playlist}/>
      <FeatureBurst id={pid}/>
    </div>
  )

}

export default Playlist