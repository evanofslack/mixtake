import { useRouter } from "next/router";
import { Badge, Tooltip } from "@mantine/core";
import Layout from "../components/Layout";
import InputBox from "../components/InputBox";
import Steps from "../components/home/Steps";
import MoodPad from "../components/home/MoodPad";
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
                <p className="mt-3 text-muted">playlist → mood → film cover</p>
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
            </section>

            {/* how it works, shown rather than told */}
            <section
                id="how"
                aria-label="how it works"
                className="mx-auto mt-16 max-w-4xl scroll-mt-20 space-y-8 px-4 sm:mt-24 sm:px-6"
            >
                <Steps />
                <MoodPad />
            </section>
        </Layout>
    );
}
