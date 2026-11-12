import { useRouter } from "next/router";
import { Badge, Tooltip } from "@mantine/core";
import Info from "../components/Info";
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
                <p className="mt-3 flex items-center gap-1 text-muted">
                    playlist → mood → film cover
                    <Info label="how it works">
                        Paste a Spotify playlist, an album, or tracks copied from the desktop app.
                        Every song&apos;s preview is analysed for mood, energy, tempo and genre as
                        you watch, then a film photograph from analogdb is picked to match.
                    </Info>
                </p>
                <div className="mt-8">
                    <InputBox mock={mock} />
                </div>
                {mock && (
                    <Tooltip label="nothing is sent to a server; songs and results are made up">
                        <Badge mt="lg" variant="light" color="gray" tabIndex={0}>
                            mock
                        </Badge>
                    </Tooltip>
                )}
            </section>
        </Layout>
    );
}
