import { useWindowScroll } from "@mantine/hooks";
import { FiGithub, FiInfo } from "react-icons/fi";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
    const [scroll] = useWindowScroll();
    const scrolled = scroll.y > 4;

    return (
        <header
            className={`sticky top-0 z-30 h-14 border-b bg-bg/80 backdrop-blur-md transition-colors ${
                scrolled ? "border-line" : "border-transparent"
            }`}
        >
            <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
                <a href="/" className="text-xl font-bold tracking-tight">
                    mixtake
                </a>
                <nav aria-label="main" className="flex items-center gap-0.5 sm:gap-2">
                    <a
                        href="/about"
                        aria-label="about"
                        className="flex h-9 items-center rounded-sm px-2 text-sm text-muted transition-colors hover:text-ink"
                    >
                        <span className="hidden sm:inline">about</span>
                        <span className="sm:hidden" aria-hidden>
                            <FiInfo size="1.1rem" />
                        </span>
                    </a>
                    <a
                        href="https://github.com/evanofslack/mixtake"
                        aria-label="source on GitHub"
                        className="flex h-9 items-center px-2 text-muted transition-colors hover:text-ink"
                    >
                        <FiGithub size="1.1rem" />
                    </a>
                    <ThemeToggle />
                </nav>
            </div>
        </header>
    );
}
