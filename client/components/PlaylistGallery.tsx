import React from "react";
import usePlaylist from "../hooks/usePlaylist"
import PlaylistCard from "./PlaylistCard";

function PlaylistGallery() {
    const { playlist, isLoading, isError } = usePlaylist()

    if (isLoading) return <div>Is loading</div>;

    if (isError) return "An error has occurred"

    if (playlist)
        return <div>Content</div>
}

export default PlaylistGallery;
