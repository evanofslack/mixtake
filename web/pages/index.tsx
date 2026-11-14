import { useState } from "react";
import { useRouter } from "next/router";
import { Badge, Tooltip } from "@mantine/core";
import Layout from "../components/Layout";
import InputBox from "../components/InputBox";
import Steps from "../components/home/Steps";
import MoodPad from "../components/home/MoodPad";
import MoodGlow from "../components/home/MoodGlow";
import ExampleCard from "../components/home/ExampleCard";
import { isMockMode } from "../lib/client";
import { glowColours } from "../lib/colours";
import { EXAMPLES, FEATURED } from "../lib/examples";
import { mockExampleId } from "../lib/mock";
import { moodColour } from "../lib/moodColour";
import { useShowcase } from "../lib/showcase";
import { useDark } from "../lib/useDark";

// prints dropped on a table: each featured cover's slight turn
const TILTS = [-2, 1.5, 1.2, -1.6];

export default function IndexPage() {
    const router = useRouter();
    const mock = router.isReady && isMockMode(router.query);
    const photos = useShowcase(mock, router.isReady);
    const dark = useDark();
    // the light around the hero leaks out of the cover last pointed at
    const [lit, setLit] = useState(0);
    const lead = EXAMPLES[lit];
    const leaked = glowColours(lead?.colors ?? [], dark);
    const glow = leaked.length
        ? leaked
        : [moodColour(lead?.mood ?? 0.6, lead?.energy ?? 0.4, dark)];
    const mockId = (i: number) => (mock ? mockExampleId(i) : undefined);
    const rest = EXAMPLES.slice(FEATURED.length);

    return (
        <Layout>
            {/* the hero: the input on the left and four finished covers on the right; on small
                screens the covers follow the input as a strip you can swipe */}
            <div className="relative isolate">
                <MoodGlow colours={glow} />
                <section className="mx-auto grid max-w-2xl grid-cols-1 gap-10 px-4 pt-10 pb-6 sm:px-6 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-x-16 lg:pt-16">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            A cover for every mix
                        </h1>
                        <p className="mt-3 text-muted">playlist → mood → cover art</p>
                        <div className="mt-8">
                            <InputBox mock={mock} />
                        </div>
                        {mock && (
                            <Tooltip label="made up songs with no server">
                                <Badge mt="lg" variant="light" color="gray" tabIndex={0}>
                                    mock
                                </Badge>
                            </Tooltip>
                        )}
                    </div>
                    {FEATURED.length > 0 && (
                        <div aria-label="covers made with mixtake" role="region">
                            <ul className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pt-2 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-2 lg:gap-x-7 lg:gap-y-8 lg:overflow-visible lg:p-0">
                                {FEATURED.map((ex, i) => (
                                    <li
                                        key={ex.slug}
                                        className="w-[44vw] max-w-52 shrink-0 snap-start lg:w-auto lg:max-w-none"
                                    >
                                        <ExampleCard
                                            example={ex}
                                            mockId={mockId(i)}
                                            eager
                                            tilt={TILTS[i % TILTS.length]}
                                            onLight={() => setLit(i)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            </div>

            {rest.length > 0 && (
                <section
                    aria-labelledby="more-covers"
                    className="mx-auto mt-14 max-w-2xl px-4 sm:px-6 lg:mt-20 lg:max-w-6xl"
                >
                    <h2 id="more-covers" className="text-lg font-semibold tracking-tight">
                        More covers
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                        From real playlists. Open one to watch it being heard.
                    </p>
                    <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-6">
                        {rest.map((ex, i) => (
                            <li key={ex.slug}>
                                <ExampleCard example={ex} mockId={mockId(FEATURED.length + i)} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* how it works, followed through one example at a time, then the mood map to play with */}
            <section
                id="how"
                aria-label="how it works"
                className="mx-auto mt-16 max-w-2xl scroll-mt-20 space-y-10 px-4 sm:mt-24 sm:px-6 lg:max-w-6xl"
            >
                <Steps mockIds={mock ? EXAMPLES.map((_, i) => mockExampleId(i)) : undefined} />
                <div className="max-w-4xl">
                    <MoodPad photos={photos} />
                </div>
            </section>
        </Layout>
    );
}
