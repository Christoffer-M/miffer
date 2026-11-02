import { createFileRoute } from "@tanstack/react-router";
import { KindPage } from "./-toWatch";

export const Route = createFileRoute("/watch/series")({ component: () => <KindPage kind="series" /> });
