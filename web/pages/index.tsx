import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Badge, Tooltip } from "@mantine/core";
import Layout from "../components/Layout";
import InputBox from "../components/InputBox";
import Steps from "../components/home/Steps";
import MoodPad from "../components/home/MoodPad";
import CoverStack from "../components/home/CoverStack";
import MoodGlow from "../components/home/MoodGlow";
import { isMockMode } from "../lib/client";
import { glowColours } from "../lib/colours";
import { moodColour } from "../lib/moodColour";
import { HERO_COVERS, nearestPhoto, pickHeroPhotos, useShowcase } from "../lib/showcase";
import { useDark } from "../lib/useDark";

export default function IndexPage() {
    const router = useRouter();
    const mock = router.isReady && isMockMode(router.query);
    const photos = useShowcase(mock, router.isReady);
    // the develop step shows a calm, happy photo: warm and easy to read at thumbnail size
    const develop = photos ? nearestPhoto(photos, 0.82, 0.3)?.src : undefined;
    const heroPhotos = useMemo(
        () => (photos ? pickHeroPhotos(photos, HERO_COVERS) : null),
        [photos],
    );
    const [front, setFront] = useState(0);
    const onFront = useCallback((i: number) => setFront(i), []);
    const dark = useDark();
    const lead = HERO_COVERS[front];
    // the light around the hero leaks out of the front cover's photo; until it loads (or if
    // analogdb gave no colours) the cover's mood colour stands in
    const leaked = glowColours(heroPhotos?.[front]?.colors ?? [], dark);
    const glow = leaked.length ? leaked : [moodColour(lead.mood, lead.energy, dark)];

    return (
        <Layout>
            {/* the hero: on wide screens the input on the left and a pile of finished covers on
                the right; on small ones the covers sit between the title and the input */}
            <div className="relative isolate">
                <MoodGlow colours={glow} />
                <section className="mx-auto grid max-w-2xl gap-8 px-4 pt-10 pb-6 sm:px-6 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-x-14 lg:pt-20">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            A cover for every mix
                        </h1>
                        <p className="mt-3 text-muted">playlist → mood → film cover</p>
                    </div>
                    <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
                        <CoverStack
                            covers={HERO_COVERS}
                            photos={heroPhotos}
                            front={front}
                            onFront={onFront}
                        />
                    </div>
                    <div>
                        <InputBox mock={mock} />
                        {mock && (
                            <Tooltip label="made up songs with no server">
                                <Badge mt="lg" variant="light" color="gray" tabIndex={0}>
                                    mock
                                </Badge>
                            </Tooltip>
                        )}
                    </div>
                </section>
            </div>

            {/* how it works, shown rather than told */}
            <section
                id="how"
                aria-label="how it works"
                className="mx-auto mt-16 max-w-4xl scroll-mt-20 space-y-8 px-4 sm:mt-24 sm:px-6"
            >
                <Steps photo={develop} />
                <MoodPad photos={photos} />
            </section>
        </Layout>
    );
}
