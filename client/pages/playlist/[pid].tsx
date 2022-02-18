import Image from "next/image";
import { useRouter } from "next/router";
import usePlaylist from "../../hooks/usePlaylist";
import FeatureRadar from "../../components/FeatureRadar";
import Layout from "../../components/Layout";

function Playlist() {
    const router = useRouter();
    const { pid } = router.query;
    if (typeof pid != "string") {
        return <div>Error getting path parameter</div>;
    }

    const { playlist, loading, error } = usePlaylist(pid);

    if (loading) return <div>Loading</div>;

    if (error) return <div>An error has occurred</div>;

    return (
        <Layout title="Playlist">
            <div className="m-12">
                <div className="flex flex-row items-center">
                    {playlist.images && (
                        <div className="h-max w-60">
                            <Image
                                src={playlist.images[0].url}
                                width={playlist.images[0].width}
                                height={playlist.images[0].height}
                                alt={"playlist cover"}
                            />
                        </div>
                    )}
                    <div className="mx-8 flex flex-col ">
                        <h1 className="text-light-primary text-5xl">{playlist.name}</h1>
                        <h2 className="text-light-secondary">{playlist.description}</h2>
                        <p className="text-light-primary">by {playlist.owner.display_name}</p>
                        <p className="text-light-primary">{playlist.tracks.items?.length} songs</p>
                    </div>
                    <FeatureRadar id={pid} />
                </div>
            </div>
        </Layout>
    );
}

export default Playlist;
