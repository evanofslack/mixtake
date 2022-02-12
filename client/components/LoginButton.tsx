import React from "react";

function LoginButton() {
    async function getRedirect() {
        await fetch("/api/login").then((response) =>
            response.json().then((data) => {
                console.log(data)
                window.location.href = data.url;
            })
        );
    }
    return (
        <button className="bg-spotify-green rounded-md p-2 text-white"
            onClick={() => getRedirect()}
        >
            CONNECT WITH SPOTIFY
        </button>
    );
}

export default LoginButton;