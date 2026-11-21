import type { TabKey } from "./derive";

// The tab whose pane is on screen. The chosen tab can stop existing while it is open
// (marking a claim as sent removes the send tab), and a missing tab must not leave the
// page without a pane.
export function shownTab(tabs: readonly TabKey[], chosen: TabKey): TabKey {
  return tabs.includes(chosen) ? chosen : "overview";
}
