import { PRINT_PAGE, type OpenPdfMessage } from '../shared/messages';
import { isSquareLabelPdfUrl } from '../square/url';

const TAB_KEY = 'printTabId';

/**
 * Icon click on the Square PDF tab → open (or focus) the print tab and hand it the PDF URL.
 * `activeTab` exposes the tab URL on click; the host permission covers squareup.com tabs anyway.
 *
 * A normal tab, not a popup window: Chrome's USB picker anchors to the address bar and closes
 * immediately (NotFoundError) in a popup window, which has none.
 */
chrome.action.onClicked.addListener(tab => {
  void openPrintTab(tab);
});

async function openPrintTab(tab: chrome.tabs.Tab): Promise<void> {
  const message: OpenPdfMessage = { type: 'open-pdf' };
  if (isSquareLabelPdfUrl(tab.url)) {
    message.url = tab.url!;
    if (tab.id !== undefined) message.tabId = tab.id;
  }

  const existing = await existingTab();
  if (existing) {
    await chrome.tabs.update(existing.id!, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.runtime.sendMessage(message).catch(() => {});
    return;
  }

  const params = new URLSearchParams();
  if (message.url) params.set('src', message.url);
  if (message.tabId !== undefined) params.set('tab', String(message.tabId));
  const created = await chrome.tabs.create({
    url: chrome.runtime.getURL(`${PRINT_PAGE}?${params.toString()}`),
    ...(tab.windowId !== undefined ? { windowId: tab.windowId } : {}),
    ...(tab.index !== undefined ? { index: tab.index + 1 } : {}),
    active: true,
  });
  if (created.id !== undefined) await chrome.storage.session.set({ [TAB_KEY]: created.id });
}

async function existingTab(): Promise<chrome.tabs.Tab | undefined> {
  const stored = await chrome.storage.session.get(TAB_KEY);
  const id = stored[TAB_KEY] as number | undefined;
  if (id === undefined) return undefined;
  try {
    return await chrome.tabs.get(id);
  } catch {
    await chrome.storage.session.remove(TAB_KEY);
    return undefined;
  }
}

chrome.tabs.onRemoved.addListener(id => {
  void chrome.storage.session.get(TAB_KEY).then(stored => {
    if (stored[TAB_KEY] === id) void chrome.storage.session.remove(TAB_KEY);
  });
});

/** Mark Square label-PDF tabs on the icon so staff know when to click it. */
chrome.tabs.onUpdated.addListener((tabId, _change, tab) => {
  const ready = isSquareLabelPdfUrl(tab.url);
  void chrome.action.setBadgeText({ tabId, text: ready ? '✓' : '' });
  if (ready) void chrome.action.setBadgeBackgroundColor({ tabId, color: '#1a7f37' });
  void chrome.action.setTitle({
    tabId,
    title: ready ? 'Print these labels' : 'Label printer',
  });
});
