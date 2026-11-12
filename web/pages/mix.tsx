import { ReactNode } from "react";
import { useRouter } from "next/router";
import { Alert, Badge, Button, Loader, Tooltip } from "@mantine/core";
import { FiAlertCircle, FiArrowLeft } from "react-icons/fi";
import Layout from "../components/Layout";
import ProgressHeader from "../components/ProgressHeader";
import Summary from "../components/Summary";
import MoodMap from "../components/MoodMap";
import EnergyArc from "../components/EnergyArc";
import GenreBars from "../components/GenreBars";
import TempoKey from "../components/TempoKey";
import TopArtists from "../components/TopArtists";
import TrackList from "../components/TrackList";
import CoverStudio from "../components/CoverStudio";
import Listen from "../components/Listen";
import { isMockMode } from "../lib/client";
import { useMixEvents } from "../lib/useMixEvents";
import { HighlightProvider } from "../lib/highlight";

// /mix?id=… : the live analysis and cover studio. A query string rather than /mix/[id], because
// a static export can't pre-render pages for ids it doesn't know.
export default function MixPage() {
    const router = useRouter();
    const id = router.isReady && typeof router.query.id === "string" ? router.query.id : null;
    const mock = router.isReady && isMockMode(router.query);
    const { snapshot, coverage, status, error } = useMixEvents(id, mock);

    if (!router.isReady) {
        return <Shell>{null}</Shell>;
    }
    if (!id) {
        return (
            <Shell>
                <Message title="No mix here">
                    This link is missing its mix. Start a new one from the front page.
                </Message>
            </Shell>
        );
    }
    if (status === "not_found") {
        return (
            <Shell>
                <Message title="We couldn't find that mix">
                    The link may be mistyped or incomplete. Paste the playlist again to make a new
                    one.
                </Message>
            </Shell>
        );
    }
    if (!snapshot || !coverage) {
        if (status === "error") {
            return (
                <Shell>
                    <Message title="Something went wrong">{error}</Message>
                </Shell>
            );
        }
        return (
            <Shell>
                <div className="flex items-center gap-3 py-16 text-muted" role="status">
                    <Loader size="sm" color="var(--mix-accent)" />
                    Opening the mix…
                </div>
            </Shell>
        );
    }

    const { mix, tracks, profile } = snapshot;
    const finished = status === "done";
    return (
        <Shell title={mix.source.name ? `${mix.source.name} · mixtake` : undefined}>
            <ProgressHeader source={mix.source} coverage={coverage} status={status} />
            {status === "error" && (
                <Alert
                    mt="lg"
                    color="red"
                    variant="light"
                    icon={<FiAlertCircle />}
                    title="The analysis stopped early"
                    role="alert"
                >
                    {error} What's below is what we managed so far.
                </Alert>
            )}
            <div className="mt-8 mb-6 max-w-3xl">
                <Summary profile={profile} final={finished} />
                {mix.vibe && (
                    <Tooltip label="the words that steer the cover photos">
                        <Badge
                            mt="xs"
                            variant="light"
                            color="gray"
                            tabIndex={0}
                            className="normal-case"
                        >
                            {mix.vibe}
                        </Badge>
                    </Tooltip>
                )}
                <Listen source={mix.source} />
            </div>
            <HighlightProvider tracks={tracks}>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <MoodMap tracks={tracks} />
                    <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
                        <GenreBars genres={profile?.genres} tracks={tracks} />
                        <TopArtists artists={profile?.artists} tracks={tracks} />
                    </div>
                    <EnergyArc trackIds={mix.track_ids} tracks={tracks} />
                    <TempoKey profile={profile} />
                    <CoverStudio
                        key={mix.id}
                        mixId={mix.id}
                        mock={mock}
                        source={mix.source}
                        analysed={coverage.done}
                        finished={finished}
                    />
                    <TrackList trackIds={mix.track_ids} tracks={tracks} />
                </div>
            </HighlightProvider>
        </Shell>
    );
}

function Shell({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <Layout title={title}>
            <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">{children}</div>
        </Layout>
    );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="max-w-lg py-12">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-3 text-muted">{children}</p>
            <Button component="a" href="/" variant="default" mt="lg" leftSection={<FiArrowLeft />}>
                Start a mix
            </Button>
        </div>
    );
}
