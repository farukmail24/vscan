/**
 * Main Application Entry Point
 * Hash Router, Network status watcher, PWA installer, and store coordinator.
 */

import { renderScan } from './ui/scan.js';
import { renderReview } from './ui/review.js';
import { renderHistory } from './ui/history.js';
import { renderSettings, applyTheme } from './ui/settings.js';
import { getSettings } from './settings.js';
import { getState, subscribe, setPendingCount } from './store.js';
import { getPendingCards, markCardSynced } from './db.js';
import { saveRecord, getKnowledgeRules } from './api.js';
import { initKnowledge, syncKnowledgeFromBackend } from './knowledge.js';
import { showToast } from './ui/toast.js';

// Route Definitions
const routes = {
  scan: renderScan,
  review: renderReview,
  history: renderHistory,
  settings: renderSettings
};

let currentRoute = 'scan';
let deferredInstallPrompt = null;

/**
 * Hash Router Handler
 */
function handleRouting() {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  const routeName = routes[hash] ? hash : 'scan';
  currentRoute = routeName;

  // Update Bottom Nav active state
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    if (tab.dataset.view === routeName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Render view
  const container = document.getElementById('view-container');
  if (container && routes[routeName]) {
    container.innerHTML = '';
    routes[routeName](container);
  }
}

/**
 * Update Header Badges & Pill States
 */
function updateHeaderState() {
  const settings = getSettings();
  const modeBadge = document.getElementById('current-mode-badge');
  if (modeBadge) {
    if (settings.mode === 'ai') {
      modeBadge.textContent = 'AI Mode';
      modeBadge.className = 'badge badge-ai';
    } else if (settings.mode === 'offline') {
      modeBadge.textContent = 'Offline OCR';
      modeBadge.className = 'badge badge-offline';
    } else {
      modeBadge.textContent = 'Auto Mode';
      modeBadge.className = 'badge badge-mode';
    }
  }

  // Network status pill
  const netPill = document.getElementById('network-status-pill');
  if (netPill) {
    if (navigator.onLine) {
      netPill.className = 'status-pill status-online';
      netPill.innerHTML = '<span class="status-dot"></span><span class="status-text">Online</span>';
    } else {
      netPill.className = 'status-pill status-offline';
      netPill.innerHTML = '<span class="status-dot"></span><span class="status-text">Offline</span>';
    }
  }
}

/**
 * Check and update pending badge in bottom nav
 */
async function refreshPendingBadge() {
  try {
    const pending = await getPendingCards();
    setPendingCount(pending.length);
  } catch (err) {
    console.warn('Could not read pending cards:', err);
  }
}

/**
 * Automatically sync pending cards when network comes back online
 */
async function autoSyncPendingCards() {
  if (!navigator.onLine) return;
  const settings = getSettings();
  if (!settings.appsScriptUrl) return;

  try {
    const pending = await getPendingCards();
    if (pending.length === 0) return;

    showToast(`Online: Syncing ${pending.length} offline card(s) to Sheet...`, 'info', 2500);

    let synced = 0;
    const uploadImages = !!settings.uploadImagesToDrive;
    for (const card of pending) {
      try {
        const res = await saveRecord(
          card.record,
          uploadImages ? card.frontBase64 : null,
          uploadImages ? card.backBase64 : null
        );
        await markCardSynced(card.id, {
          row: res.row,
          frontImageUrl: res.frontImageUrl,
          backImageUrl: res.backImageUrl
        });
        synced++;
      } catch (err) {
        console.warn('Auto sync item error:', err);
      }
    }

    if (synced > 0) {
      showToast(`Auto-sync complete: ${synced} card(s) uploaded!`, 'success', 3000);
      refreshPendingBadge();
      if (currentRoute === 'history') {
        renderHistory(document.getElementById('view-container'));
      }
    }
  } catch (err) {
    console.warn('Auto sync error:', err);
  }
}

/**
 * PWA Install Prompt Handler
 */
function setupPwaInstall() {
  const installBtn = document.getElementById('pwa-install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-flex';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('Thank you for installing Card Scanner!', 'success');
      }
      deferredInstallPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
  });
}

/**
 * Global Error Boundary
 */
function setupGlobalErrorHandling() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    const msg = event.reason?.message || 'An unexpected error occurred';
    showToast(msg, 'error', 4500);
  });

  window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error || event.message);
  });
}

/**
 * App Initialization
 */
function init() {
  const settings = getSettings();
  applyTheme(settings.theme);

  // Network listeners
  window.addEventListener('online', () => {
    updateHeaderState();
    showToast('Internet connection restored.', 'info', 2000);
    autoSyncPendingCards();
  });

  window.addEventListener('offline', () => {
    updateHeaderState();
    showToast('Device went offline. Scanner is running in Offline Mode.', 'warning', 3000);
  });

  // Settings change listener
  window.addEventListener('settings-changed', () => {
    updateHeaderState();
  });

  // State store subscription (updates nav badges)
  subscribe((state) => {
    const reviewDot = document.getElementById('review-active-dot');
    if (reviewDot) {
      reviewDot.style.display = state.currentScan ? 'block' : 'none';
    }

    const historyBadge = document.getElementById('history-pending-badge');
    if (historyBadge) {
      if (state.pendingCount > 0) {
        historyBadge.style.display = 'block';
        historyBadge.textContent = state.pendingCount;
      } else {
        historyBadge.style.display = 'none';
      }
    }
  });

  // Router listener
  window.addEventListener('hashchange', handleRouting);

  // Initial setup
  setupGlobalErrorHandling();
  setupPwaInstall();
  updateHeaderState();
  refreshPendingBadge();

  if (!window.location.hash) {
    window.location.hash = '#/scan';
  } else {
    handleRouting();
  }

  // Initialize Knowledge Pack & Self-Learning Engine
  initKnowledge().catch(console.warn);

  // Background sync knowledge rules from Sheet tab "Rules" if online
  if (navigator.onLine && getSettings().appsScriptUrl) {
    getKnowledgeRules()
      .then(res => {
        if (res && res.rules && res.rules.length > 0) {
          syncKnowledgeFromBackend(res.rules);
        }
      })
      .catch(() => {});
  }

  // Attempt auto-sync at startup if online
  if (navigator.onLine) {
    autoSyncPendingCards();
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
