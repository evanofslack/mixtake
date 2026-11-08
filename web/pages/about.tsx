import Layout from "../components/Layout";

export default function AboutPage() {
    return (
        <Layout title="about · mixtake">
            <section className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
                <h1 className="text-2xl font-semibold tracking-tight">About</h1>
                <p className="mt-3 text-muted">
                    mixtake analyses the 30 second previews of your songs with Essentia and picks a
                    film photograph from analogdb that matches. It isn&apos;t affiliated with
                    Spotify.
                </p>
            </section>
        </Layout>
    );
}
