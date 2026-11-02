import { createFileRoute } from "@tanstack/react-router";
import { KindPage } from "./-toWatch";

export const Route = createFileRoute("/watch/movies")({ component: () => <KindPage kind="movie" /> });
