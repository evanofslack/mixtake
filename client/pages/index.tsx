import type { NextPage } from 'next'
import Head from 'next/head'
import LoginButton from '../components/LoginButton'

const Home: NextPage = () => {
  return (
    <div>
      <div>Welcome to Mixtake</div>
      <LoginButton/>
    </div>
  )
}

export default Home
