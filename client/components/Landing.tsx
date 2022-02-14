import LoginButton from '../components/LoginButton'

export default function Landing() {
  return (

    <div>
            <div className="flex flex-col items-center justify-center">
            <h1 className="text-6xl font-bold pt-48 text-light-primary">Mixtake</h1>
            <h2 className="text-2xl font-medium py-12 mx-12 text-center text-light-secondary">A new way to interact with your playlists</h2>
              <LoginButton />
            <div className="h-screen pt-24">DEMO</div>
              
              
            
        </div>
    </div>

  )
}

