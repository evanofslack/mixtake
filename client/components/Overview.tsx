import React from "react";
import PlaylistGallery from "./PlaylistGallery";
import Player from "./Player/Player";

export default function Overview(): JSX.Element {
    return (
        <div className="flex flex-col items-center">
            {/* <Player/> */}
            <h1 className="text-light-primary py-6 text-3xl font-medium">Your Mixes</h1>
            <h3 className="text-light-secondary pb-6">Select a mix...</h3>
            <PlaylistGallery />
        </div>
    );
}
