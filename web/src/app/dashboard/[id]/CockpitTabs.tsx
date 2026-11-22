"use client";

import { useState, type ReactNode } from "react";
import type { Badges, TabKey } from "@/lib/cockpit/derive";
import { shownTab } from "@/lib/cockpit/tabs";
import CockpitHeader, { type CockpitHeaderProps } from "./CockpitHeader";

export type CockpitTabsProps = {
  header: Omit<CockpitHeaderProps, "onNavigate">;
  badges: Badges;
  initialTab: TabKey;
  overview: ReactNode;
  // Null when the claim has nothing to send yet — the tab is then not shown.
  send: ReactNode | null;
  form: ReactNode;
  files: ReactNode;
};

const TAB_LABEL: Record<TabKey, string> = {
  overview: "סקירה",
  send: "שליחה למבטחת",
  form: "טופס ההודעה",
  files: "קבצים",
};
const TAB_ORDER: TabKey[] = ["overview", "send", "form", "files"];

// Panes stay mounted (server-rendered once); switching is show/hide, and the
// URL mirrors the active tab via replaceState so links/refreshes land right.
export default function CockpitTabs(p: CockpitTabsProps) {
  const tabs = TAB_ORDER.filter((key) => key !== "send" || p.send !== null);
  const [chosen, setTab] = useState<TabKey>(p.initialTab);
  // The send tab disappears once the claim is sent; never leave the page without a pane.
  const tab = shownTab(tabs, chosen);

  function navigate(next: TabKey) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
    document.getElementById("cockpit-panes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function badgeFor(key: TabKey): ReactNode {
    const n =
      key === "overview" ? p.badges.overview
      : key === "send" ? p.badges.send
      : key === "form" ? p.badges.form
      : p.badges.files;
    if (!n) return null;
    const cls = key === "files" ? "bg-zinc-400" : "bg-red-500";
    return (
      <span className={`mr-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-white ${cls}`}>{n}</span>
    );
  }

  const panes: Record<TabKey, ReactNode> = {
    overview: p.overview, send: p.send, form: p.form, files: p.files,
  };

  return (
    <div className="space-y-6">
      <CockpitHeader {...p.header} onNavigate={navigate} />
      <div className="border-b border-zinc-200" role="tablist">
        {tabs.map((key) => (
          <button
            key={key} type="button" role="tab" aria-selected={tab === key}
            onClick={() => navigate(key)}
            className={`px-4 py-2.5 text-sm ${
              tab === key
                ? "-mb-px border-b-2 border-blue-600 font-semibold text-blue-700"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {TAB_LABEL[key]}
            {badgeFor(key)}
          </button>
        ))}
      </div>
      <div id="cockpit-panes">
        {tabs.map((key) => (
          <div key={key} role="tabpanel" className={tab === key ? "space-y-6" : "hidden"}>
            {panes[key]}
          </div>
        ))}
      </div>
    </div>
  );
}
