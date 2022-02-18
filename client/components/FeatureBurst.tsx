import usePlaylistFeatures from "../hooks/usePlaylistFeatures";
import { ResponsiveRadar } from "@nivo/radar";

type burstProps = {
    id: string;
};

export default function FeatureBurst({ id }: burstProps): JSX.Element {
    const { features, loading, error } = usePlaylistFeatures(id);

    if (loading) return <div>Loading</div>;

    if (error) return <div>An error has occurred</div>;

    return (
        <div>
            <div className="text-light-primary px-8 py-4">
                <p>Acousticness: {features.acousticness}</p>
                <p>Danceability: {features.danceability}</p>
                <p>Energy: {features.energy}</p>
                <p>Valence: {features.valence}</p>
                <p>Instrumentalness: {features.instrumentalness}</p>
                <p>Liveness: {features.liveness}</p>
                <p>Loudness: {features.loudness}</p>
                <p>Speechiness: {features.speechiness}</p>
                <p>Key: {features.key}</p>
                <p>Mode: {features.mode}</p>
                <p>Duration: {features.duration_ms}</p>
                <p>Time Signature: {features.time_signature}</p>
                <p>Tempo: {features.tempo}</p>
            </div>
        </div>
    );
}
