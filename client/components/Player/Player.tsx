import React, { useEffect } from "react";
import {useState} from 'react'
import usePlayerState from './usePlayerState'
import { BsPlayCircleFill } from "react-icons/bs";
import { BsFillPauseCircleFill } from "react-icons/bs";

async function play() {
    await fetch("/api/play").then((response) =>
        response.json().then((data) => {
            console.log(data)
        })
    );
}

async function pause() {
    await fetch("/api/pause").then((response) =>
        response.json().then((data) => {
            console.log(data)
        })
    );
}

export default function Player(): JSX.Element {

    const {state, loading, error } = usePlayerState()
    const [isPlaying, setPlaying] = useState(true)

    useEffect(() => {
        if (!loading && state) {
            setPlaying(state.is_playing)
        }
    }, [state])


    return (
    <div>
        {loading && !state && (
            <div>Loading</div>
        )}

        {!loading && state && (
            <div className="flex flex-col items-center bg-light-secondary rounded-md px-6 py-3 text-white">
                <h1>Currently listening to</h1>
                    <p>{state.item.album.name}</p>
                    {state.item.album.artists && (
                        <p>by {state.item.album.artists[0].name}</p>
                    )
                        
                    }
                
                {isPlaying && <BsFillPauseCircleFill size="2rem" onClick={() => { pause(); setPlaying(!isPlaying)}}/> }
                {!isPlaying &&  <BsPlayCircleFill size="2rem" onClick={() => { play(); setPlaying(!isPlaying)}}/> }
            </div>
        )}
    </div>
    );
}

