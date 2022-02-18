import React from "react";
import usePlaylistPage from "../hooks/usePlaylistPage";
import PlaylistCard from "./PlaylistCard";

function PlaylistGallery(): JSX.Element {
    const { playlistPage, loading, error } = usePlaylistPage();

    if (loading) return <div>Loading</div>;

    if (error) return <div>An error has occurred</div>;

    return (
        <div className="flex flex-row flex-wrap items-center justify-center px-2">
            {playlistPage.items &&
                playlistPage.items.map((playlist, index) => {
                    return <PlaylistCard playlist={playlist} key={index} />;
                })}
        </div>
    );
}

export default PlaylistGallery;
