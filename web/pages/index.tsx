import { useRouter } from "next/router";
import Layout from "../components/Layout";
import InputBox from "../components/InputBox";
import { isMockMode } from "../lib/client";

export default function IndexPage() {
    const router = useRouter();
    const mock = router.isReady && isMockMode(router.query);

    return (
        <Layout>
            <section className="mx-auto max-w-2xl px-4 pt-12 pb-6 sm:px-6 lg:pt-20">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    A cover for every mix
                </h1>
                <p className="mt-3 text-muted">
                    Paste a Spotify playlist, an album, or tracks copied from the desktop app. We
                    listen to every song, map its mood and energy as you watch, and find a film
                    photograph that matches.
                </p>
                <div className="mt-8">
                    <InputBox mock={mock} />
                </div>
                {mock && (
                    <p className="mt-6 text-xs text-muted">
                        Mock mode: nothing is sent to a server; songs and results are made up.
                    </p>
                )}
            </section>
        </Layout>
    );
}
