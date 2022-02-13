import type { NextPage } from 'next'
import Head from 'next/head'
import LoginButton from '../components/LoginButton'
import useAuth from '../hooks/useAuth'

const Home: NextPage = () => {

  const {isLoading, isAuth} = useAuth()

  return (
    <div>
      <div>Welcome to Mixtake</div>

      {isLoading && !isAuth && (
        <div>Loading</div>
      )}

      {!isLoading && !isAuth && (
        <LoginButton />
      )}

      {!isLoading && isAuth && (
        <div>You are logged in </div>
      )}
      
    </div>
  )
}

export default Home
