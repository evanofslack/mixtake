import type { NextPage } from 'next'
import Layout from "../components/Layout"
import useUser from '../hooks/useUser'
import PlaylistGallery from '../components/PlaylistGallery'
import Landing from '../components/Landing'

const Home: NextPage = () => {

  const {isLoading, user} = useUser()

  return (

    <Layout title="Mixtake">
          {isLoading && !user && (
            <div>Loading</div>
          )}

          {!isLoading && !user && (
            <Landing />
          )}

          {!isLoading && user && (
            <div>
              <PlaylistGallery/>
            </div>
          )}
    </Layout>

  )
}

export default Home
