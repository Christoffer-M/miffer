import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { ChevronLeft, Tv, TvMinimalPlay } from "lucide-react";
import { buttonClass } from "../../components/Button";
import { watchQuery } from "../../queries/watch";
import { isWatching, toStart } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import { Pick, PosterGrid, useToWatch } from "./-toWatch";
import { WatchingPanel } from "./-watching";
import s from "./watch.module.css";

export type SeriesTab = "watching" | "start";

export const Route = createFileRoute("/watch/series")({
  // Which tab: Watch's Watching card asks for Watching, the shelf's See all for To start.
  validateSearch: (search: Record<string, unknown>): { tab?: SeriesTab } =>
    search.tab === "watching" || search.tab === "start" ? { tab: search.tab } : {},
  component: Series,
});

/**
 * Every series not watched yet, as two tabs: the ones being watched, and the ones still to
 * start. Starting one moves it from To start to Watching; Put back moves it back.
 */
function Series() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const navigate = useNavigate();
  const { open, start, sheet, bottom, undo } = useToWatch();

  const watchingCount = list.filter(isWatching).length;
  const shown = toStart(list, "series");
  // Without a tab asked for: Watching, unless nothing is being watched.
  const tab = Route.useSearch().tab ?? (isPending || watchingCount > 0 ? "watching" : "start");

  return (
    <>
      <header className={`${g.header} ${s.tabbedHeader}`} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>Series</h1>
      </header>

      <Tabs
        className={s.tabs}
        selectedKey={tab}
        onSelectionChange={(k) => navigate({ to: "/watch/series", search: { tab: k as SeriesTab }, replace: true })}
      >
        <TabList aria-label="Watching or to start" className={s.kindTabs}>
          <Tab id="watching" className={s.kindTab} aria-label={`Watching, ${watchingCount}`}>
            <TvMinimalPlay size={18} aria-hidden />
            Watching
            <span className={s.kindCount}>{watchingCount}</span>
          </Tab>
          <Tab id="start" className={s.kindTab} aria-label={`To start, ${shown.length}`}>
            <Tv size={18} aria-hidden />
            To start
            <span className={s.kindCount}>{shown.length}</span>
          </Tab>
        </TabList>

        <TabPanel id="watching" className={`${ui.content} ${g.list} ${s.watching}`}>
          <WatchingPanel offer={undo.offer} />
        </TabPanel>

        <TabPanel id="start" className={`${ui.content} ${g.list}`}>
          {error && <p className={ui.error}>{error.message}</p>}
          {!isPending && shown.length === 0 && (
            <p className={`${ui.muted} ${g.empty}`}>No series to start. Tap + to add one.</p>
          )}
          {shown.length > 0 && (
            <>
              <div className={`${ui.row} ${s.countRow} ${s.panelRow}`}>
                <p className={`${ui.muted} ${ui.small}`}>{shown.length} to start</p>
                <Pick list={shown} kind="series" onStart={start} />
              </div>
              <PosterGrid list={shown} kind="series" onOpen={open} />
            </>
          )}
        </TabPanel>
      </Tabs>

      {sheet}
      {bottom}
    </>
  );
}
