import React from "react";
import usePlaylist from "../hooks/usePlaylist"
import PlaylistCard from "./PlaylistCard";

function PlaylistGallery(): JSX.Element {
    const { playlistPage, isLoading, isError } = usePlaylist()

    if (isLoading) return <div>Is loading</div>;

    if (isError) return <div>An error has occurred</div>;

    return (
        <div >
            {playlistPage.items && playlistPage.items.map((playlist, index) => {
                return <PlaylistCard playlist={playlist} key={index} />
            })}
        </div>
    )

}

export default PlaylistGallery;
