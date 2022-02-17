import React from "react";
import PlaylistGallery from "./PlaylistGallery";
import Player from "./Player/Player"

export default function Overview(): JSX.Element {
    return (
        <div className="flex flex-col items-center">
            {/* <Player/> */}
            <h1 className="text-light-primary text-3xl font-medium py-6">Your Mixes</h1>
            <h3 className="text-light-secondary pb-6">Select a mix...</h3>
            <PlaylistGallery />
        </div>
    )

}

