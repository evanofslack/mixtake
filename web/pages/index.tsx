import Layout from "../components/Layout";

export default function IndexPage() {
    return (
        <Layout>
            <section className="mx-auto max-w-6xl px-4 pt-12 pb-6 sm:px-6 lg:pt-20">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    A cover for every mix
                </h1>
                <p className="mt-3 max-w-xl text-muted">
                    Paste a Spotify playlist, an album, or tracks copied from the desktop app. We
                    listen to every song and find a film photograph that matches.
                </p>
            </section>
        </Layout>
    );
}
