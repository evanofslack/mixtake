import type { NextPage } from 'next'
import Layout from "../components/Layout"
import LoginButton from '../components/LoginButton'
import useAuth from '../hooks/useAuth'
import PlaylistGallery from '../components/PlaylistGallery'

const Home: NextPage = () => {

  const {isLoading, isAuth} = useAuth()

  return (

    <Layout title="Mixtake">
        <div className="flex flex-col items-center justify-center">
        <h1 className="text-6xl font-bold pt-36 text-light-primary" >Mixtake</h1>
        <h2 className="text-3xl font-light py-16 mx-12 text-center text-light-secondary">Explore your playlists and create unique cover art </h2>

          {isLoading && !isAuth && (
            <div>Loading</div>
          )}

          {!isLoading && !isAuth && (
            <LoginButton />
          )}

          {!isLoading && isAuth && (
            <div>
              <PlaylistGallery/>
            </div>
          )}
          
        </div>
    </Layout>

  )
}

export default Home
