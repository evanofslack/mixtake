import { RiNeteaseCloudMusicLine } from "react-icons/ri";
import { BiLogOut } from "react-icons/bi";
import useUser from "../hooks/useUser";
import Link from "next/link";

export default function Nav() {
    const { user, isLoading, error } = useUser();

    async function logout() {
        fetch("/api/logout")
            .then((res) => res.json)
            .then(() => {
                window.location.href = "http://localhost:3000/";
            });
    }

    async function login() {
        await fetch("/api/login").then((response) =>
            response.json().then((data) => {
                window.location.href = data.url;
            })
        );
    }

    return (
        <nav className="text-light-primary flex flex-row justify-between p-4 text-lg font-medium">
            <Link href={"/"}>
                <div className="flex flex-row">
                    <RiNeteaseCloudMusicLine size="1.6rem" />
                    &nbsp;mixtake
                </div>
            </Link>

            {isLoading && !user && <div>Loading</div>}

            {!isLoading && !user && <div onClick={login}>Login</div>}

            {!isLoading && user && (
                <div className="flex flex-row items-center">
                    Hi {user.display_name.split(" ")[0]}
                    &nbsp;
                    <BiLogOut size="1.4rem" onClick={logout} />
                </div>
            )}
        </nav>
    );
}
