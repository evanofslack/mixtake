import Image from "next/image";
import { useRouter } from "next/router";
import usePlaylist from "../../hooks/usePlaylist";
import FeatureRadar from "../../components/FeatureRadar";
import Layout from "../../components/Layout";
import TrackCard from "../../components/TrackCard";

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
            <div className="my-8 mx-16">
                <div className="flex max-w-[80rem] flex-row items-center justify-between">
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
                            <h1 className="text-light-primary pb-2 text-6xl">{playlist.name}</h1>
                            <h2 className="text-light-secondary">{playlist.description}</h2>
                            <p className="text-light-secondary">by {playlist.owner.display_name}</p>
                            <p className="text-light-secondary">
                                {playlist.tracks.items?.length} songs
                            </p>
                        </div>
                    </div>
                    <FeatureRadar id={pid} />
                </div>
                <div className="flex w-full max-w-[80rem] flex-col items-start justify-center bg-white p-2">
                    {playlist.tracks.items &&
                        playlist.tracks.items.map((item, index) => {
                            return <TrackCard track={item.track} key={index} />;
                        })}
                </div>
            </div>
        </Layout>
    );
}

export default Playlist;
