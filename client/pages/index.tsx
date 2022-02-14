import type { NextPage } from 'next'
import Layout from "../components/Layout"
import LoginButton from '../components/LoginButton'
import useAuth from '../hooks/useAuth'
import PlaylistGallery from '../components/PlaylistGallery'
import Landing from '../components/Landing'

const Home: NextPage = () => {

  const {isLoading, isAuth} = useAuth()

  return (

    <Layout title="Mixtake">
          {isLoading && !isAuth && (
            <div>Loading</div>
          )}

          {!isLoading && !isAuth && (
            <Landing />
          )}

          {!isLoading && isAuth && (
            <div>
              <PlaylistGallery/>
            </div>
          )}
    </Layout>

  )
}

export default Home
