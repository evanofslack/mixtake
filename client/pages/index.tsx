import type { NextPage } from 'next'
import Layout from "../components/Layout"
import useUser from '../hooks/useUser'
import Overview from '../components/Overview'
import Landing from '../components/Landing'

const Home: NextPage = () => {

  const {user, isLoading, error} = useUser()

  return (

    <Layout title="Mixtake">
          {isLoading && !user && (
            <div>Loading</div>
          )}

          {!isLoading && !user && (
            <Landing />
          )}

          {!isLoading && user && (
            <Overview/>
          )}
    </Layout>

  )
}

export default Home
