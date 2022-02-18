import LoginButton from "../components/LoginButton";

export default function Landing() {
    return (
        <div>
            <div className="flex flex-col items-center justify-center">
                <h1 className="text-light-primary pt-48 text-6xl font-bold">Mixtake</h1>
                <h2 className="text-light-secondary mx-12 py-12 text-center text-2xl font-medium">
                    A new way to interact with your playlists
                </h2>
                <LoginButton />
                <div className="h-screen pt-24">DEMO</div>
            </div>
        </div>
    );
}
