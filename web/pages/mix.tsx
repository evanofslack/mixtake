import { useRouter } from "next/router";
import Layout from "../components/Layout";

// /mix?id=… : the live analysis and cover studio. A query string rather than /mix/[id], because
// a static export can't pre-render pages for ids it doesn't know.
export default function MixPage() {
    const router = useRouter();
    const id = typeof router.query.id === "string" ? router.query.id : null;

    return (
        <Layout title="mixtake">
            <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
                <p className="text-muted">{id ? `mix ${id}` : "no mix selected"}</p>
            </section>
        </Layout>
    );
}
