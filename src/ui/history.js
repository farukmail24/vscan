/**
 * History & Category Folders Screen Component
 * Browses saved cards grouped by Event / Category (e.g. "GTD EXPO", "General"),
 * enables isolated category exploration, dedicated category CSV export, and vCard generation.
 * Zero emojis — 100% clean SVG vector icons.
 */

import { getAllCardsLocal, getPendingCards, markCardSynced, deleteCardLocal, saveCardLocal } from '../db.js';
import { saveRecord, listCardsFromDB, deleteCardFromDB } from '../api.js';
import { setPendingCount } from '../store.js';
import { groupCardsByCategory, getCategories, addCategory, setCurrentCategory, getCurrentCategory } from '../categories.js';
import { openModal, openImageZoomModal } from './modal.js';
import { showToast } from './toast.js';

export async function renderHistory(container) {
  const cards = await getAllCardsLocal();
  const pendingCards = cards.filter(c => c.status === 'pending');
  setPendingCount(pendingCards.length);

  // Screen state
  let viewMode = 'categories'; // 'categories' | 'all'
  let selectedCategory = null; // string | null (when inside a folder)
  let currentSearch = '';
  let activeFilter = 'all'; // 'all' | 'pending' | 'review' | 'ai' | 'offline'

  function renderView() {
    const categoryGroups = groupCardsByCategory(cards);
    const activeCategoryGroup = selectedCategory
      ? categoryGroups.find(g => g.category.toLowerCase() === selectedCategory.toLowerCase())
      : null;

    // Filter cards for list display
    let targetCards = cards;
    if (viewMode === 'categories' && selectedCategory) {
      targetCards = activeCategoryGroup ? activeCategoryGroup.cards : [];
    }

    const filtered = targetCards.filter((card) => {
      const rec = card.record || {};
      const q = currentSearch.toLowerCase();
      const matchesSearch = !q ||
        (rec.name || '').toLowerCase().includes(q) ||
        (rec.company || '').toLowerCase().includes(q) ||
        (rec.designation || '').toLowerCase().includes(q) ||
        (rec.category || card.category || '').toLowerCase().includes(q) ||
        (rec.phones || []).some(p => p.toLowerCase().includes(q)) ||
        (rec.emails || []).some(e => e.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeFilter === 'pending') return card.status === 'pending';
      if (activeFilter === 'review') return !!rec.needsReview;
      if (activeFilter === 'ai') return card.source === 'AI';
      if (activeFilter === 'offline') return card.source === 'Offline';
      return true;
    });

    container.innerHTML = `
      <div class="history-view-content">
        <!-- Offline Sync Banner if pending cards exist -->
        ${pendingCards.length > 0 ? `
          <div class="card-panel" style="background-color: rgba(245, 158, 11, 0.15); border-color: var(--accent-amber); padding: 12px 16px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="status-dot" style="background-color: var(--accent-amber);"></span>
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--accent-amber);">
                  ${pendingCards.length} card${pendingCards.length > 1 ? 's' : ''} saved offline
                </span>
              </div>
              <button type="button" id="sync-now-btn" class="btn btn-primary btn-sm" style="background-color: var(--accent-amber); color: #000; border-color: transparent;">
                Sync Now
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Top Navigation Mode Switcher -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; gap: 6px; background: var(--bg-card); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <button type="button" id="tab-mode-categories" class="btn btn-sm ${viewMode === 'categories' ? 'btn-primary' : 'btn-secondary'}" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Event Folders (${categoryGroups.length})</span>
            </button>
            <button type="button" id="tab-mode-all" class="btn btn-sm ${viewMode === 'all' ? 'btn-primary' : 'btn-secondary'}" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>All Contacts (${cards.length})</span>
            </button>
          </div>

          <div style="display: flex; gap: 6px;">
            <button type="button" id="fetch-tidb-btn" class="btn-icon" title="Pull latest cards from TiDB Cloud database">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
              </svg>
              <span style="font-size: 0.72rem; font-weight: 600; margin-left: 4px;">TiDB</span>
            </button>

            ${viewMode === 'all' ? `
              <button type="button" id="export-all-csv-btn" class="btn-icon" title="Export all contacts to CSV">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span style="font-size: 0.72rem; font-weight: 600; margin-left: 4px;">CSV</span>
              </button>
            ` : ''}
          </div>
        </div>

        ${viewMode === 'categories' && !selectedCategory ? `
          <!-- CATEGORIES OVERVIEW MODE -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 8px;">
            <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-blue);">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Categories & Event Folders</span>
            </div>
            <button type="button" id="create-category-btn" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 5px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>+ New Event</span>
            </button>
          </div>

          <!-- Category Folders Grid / List -->
          <div id="category-folders-container">
            ${categoryGroups.length === 0 ? `
              <div class="card-panel" style="text-align: center; padding: 30px 16px;">
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 6px;">No event folders created yet</div>
                <p style="font-size: 0.8rem; color: var(--text-muted);">Create an event folder or scan cards to populate categories.</p>
              </div>
            ` : categoryGroups.map(cat => {
              const isCurrent = cat.category.toLowerCase() === getCurrentCategory().toLowerCase();
              return `
                <div class="category-card ${isCurrent ? 'is-active-folder' : ''}" data-category="${escapeHtml(cat.category)}">
                  <div class="category-card-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <div style="width: 42px; height: 42px; border-radius: var(--radius-md); background: ${isCurrent ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-tertiary)'}; display: flex; align-items: center; justify-content: center; color: ${isCurrent ? 'var(--accent-blue)' : 'var(--text-secondary)'}; flex-shrink: 0;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </div>
                      <div>
                        <div class="category-folder-title">
                          <span>${escapeHtml(cat.category)}</span>
                          ${isCurrent ? '<span class="badge badge-ai" style="font-size: 0.65rem; padding: 2px 6px;">Active Scan</span>' : ''}
                        </div>
                        <div class="category-meta-text">
                          ${cat.count} contact${cat.count === 1 ? '' : 's'} · ${cat.lastScannedAt ? `Last scan ${formatDateFriendly(cat.lastScannedAt)}` : 'No cards yet'}
                        </div>
                      </div>
                    </div>

                    <span class="category-pill-badge">
                      ${cat.count} Card${cat.count === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div class="category-card-actions" onclick="event.stopPropagation();">
                    <button type="button" class="btn btn-secondary btn-sm export-cat-csv-btn" data-cat="${escapeHtml(cat.category)}" style="display: inline-flex; align-items: center; gap: 5px; flex: 1;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span>Export CSV</span>
                    </button>

                    <button type="button" class="btn btn-primary btn-sm open-folder-btn" data-cat="${escapeHtml(cat.category)}" style="display: inline-flex; align-items: center; gap: 5px; flex: 1;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                      <span>Open Folder</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <!-- INSIDE SPECIFIC CATEGORY OR ALL-CARDS LIST MODE -->
          ${viewMode === 'categories' && selectedCategory ? `
            <div class="category-breadcrumb-bar">
              <div style="display: flex; align-items: center; gap: 10px;">
                <button type="button" id="back-to-categories-btn" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                  <span>Folders</span>
                </button>
                <div>
                  <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                    <span>${escapeHtml(selectedCategory)}</span>
                    <span class="category-pill-badge">${targetCards.length}</span>
                  </div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">
                    Showing cards saved to this category
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 6px; align-items: center;">
                <button type="button" id="export-category-csv-btn" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;" title="Export only this event to CSV">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>CSV</span>
                </button>

                <button type="button" id="export-category-vcf-btn" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;" title="Export category vCard">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <span>vCard</span>
                </button>

                <button type="button" id="scan-to-category-btn" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;" title="Scan a new card into this category">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                  <span>+ Scan</span>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Search Bar -->
          <div style="margin-bottom: 12px; position: relative;">
            <input type="search" id="history-search" class="form-input" style="padding-left: 36px;" placeholder="${selectedCategory ? `Search contacts in ${escapeHtml(selectedCategory)}...` : 'Search by name, company, phone, email, category...'}" value="${escapeHtml(currentSearch)}" />
            <span style="position: absolute; left: 12px; top: 13px; color: var(--text-muted); pointer-events: none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
          </div>

          <!-- Filter Pills (All Contacts mode or Inside Folder) -->
          <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px;">
            <button type="button" class="btn-sm btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all">All (${targetCards.length})</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" data-filter="pending">Pending</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'review' ? 'btn-primary' : 'btn-secondary'}" data-filter="review">Needs Review</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'ai' ? 'btn-primary' : 'btn-secondary'}" data-filter="ai">AI</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'offline' ? 'btn-primary' : 'btn-secondary'}" data-filter="offline">Offline</button>
          </div>

          <!-- Cards List -->
          <div id="cards-list-container">
            ${filtered.length === 0 ? `
              <div class="card-panel" style="text-align: center; padding: 30px 16px;">
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px;">No matching business cards found</div>
                <p style="font-size: 0.8rem; color: var(--text-muted);">
                  ${currentSearch ? 'Try a different search query or clear the filter.' : (selectedCategory ? `No cards have been scanned into "${escapeHtml(selectedCategory)}" yet.` : 'Captured cards will appear here.')}
                </p>
              </div>
            ` : `
              ${filtered.map(card => {
                const rec = card.record || {};
                const firstLetter = (rec.name || rec.company || '?').charAt(0).toUpperCase();
                const primaryPhone = (rec.phones && rec.phones[0]) || '';
                const primaryEmail = (rec.emails && rec.emails[0]) || '';
                const cardCat = rec.category || card.category || 'General';

                return `
                  <div class="contact-item" data-id="${card.id}">
                    <div class="contact-avatar">
                      ${card.frontBase64 ? `
                        <img src="${card.frontBase64}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);" />
                      ` : firstLetter}
                    </div>

                    <div class="contact-info">
                      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap;">
                        <span class="contact-name">${escapeHtml(rec.name || 'Unnamed Contact')}</span>
                        <span class="badge" style="background: rgba(59, 130, 246, 0.12); color: var(--accent-blue); font-size: 0.65rem;">${escapeHtml(cardCat)}</span>
                        ${card.status === 'pending' ? '<span class="badge badge-pending">Pending</span>' : '<span class="badge badge-synced">Synced</span>'}
                        ${rec.needsReview ? '<span class="badge badge-offline">Review</span>' : ''}
                      </div>

                      <div class="contact-sub">
                        ${escapeHtml(rec.designation ? `${rec.designation} · ${rec.company || ''}` : (rec.company || ''))}
                      </div>

                      ${primaryPhone ? `
                        <div style="font-size: 0.75rem; color: var(--accent-blue); font-family: var(--font-mono); margin-top: 2px;">
                          ${escapeHtml(primaryPhone)}
                        </div>
                      ` : ''}
                    </div>

                    <div style="display: flex; gap: 4px; margin-left: 8px;" onclick="event.stopPropagation();">
                      ${primaryPhone ? `
                        <a href="tel:${escapeHtml(primaryPhone)}" class="btn-icon" title="Call ${escapeHtml(primaryPhone)}" style="color: var(--accent-emerald);">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </a>
                      ` : ''}

                      ${primaryEmail ? `
                        <a href="mailto:${escapeHtml(primaryEmail)}" class="btn-icon" title="Email ${escapeHtml(primaryEmail)}" style="color: var(--accent-blue);">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        </a>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            `}
          </div>
        `}
      </div>
    `;

    // Bind event handlers
    const tabCategories = container.querySelector('#tab-mode-categories');
    const tabAll = container.querySelector('#tab-mode-all');
    if (tabCategories) {
      tabCategories.onclick = () => {
        viewMode = 'categories';
        selectedCategory = null;
        renderView();
      };
    }
    if (tabAll) {
      tabAll.onclick = () => {
        viewMode = 'all';
        selectedCategory = null;
        renderView();
      };
    }

    // Create Category Button
    const createCatBtn = container.querySelector('#create-category-btn');
    if (createCatBtn) {
      createCatBtn.onclick = () => {
        const name = prompt('Enter new Event / Category name (e.g. GTD EXPO, Gitex 2026):');
        if (name && name.trim()) {
          const added = addCategory(name.trim());
          setCurrentCategory(added);
          selectedCategory = added;
          showToast(`Event folder "${added}" created!`, 'success', 2500);
          renderView();
        }
      };
    }

    // Category Card Click & Open Button
    container.querySelectorAll('.category-card').forEach((cardEl) => {
      cardEl.onclick = () => {
        selectedCategory = cardEl.dataset.category;
        renderView();
      };
    });

    container.querySelectorAll('.open-folder-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        selectedCategory = btn.dataset.cat;
        renderView();
      };
    });

    // Category Export CSV button directly from folder card
    container.querySelectorAll('.export-cat-csv-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const group = categoryGroups.find(g => g.category.toLowerCase() === catName.toLowerCase());
        const catCards = group ? group.cards : [];
        if (catCards.length === 0) {
          showToast(`No contacts in "${catName}" to export`, 'warning');
          return;
        }
        exportCardsCsv(catCards, catName);
      };
    });

    // Back to categories button
    const backBtn = container.querySelector('#back-to-categories-btn');
    if (backBtn) {
      backBtn.onclick = () => {
        selectedCategory = null;
        currentSearch = '';
        renderView();
      };
    }

    // Category Toolbar Export Buttons
    const catExportCsvBtn = container.querySelector('#export-category-csv-btn');
    if (catExportCsvBtn) {
      catExportCsvBtn.onclick = () => {
        exportCardsCsv(targetCards, selectedCategory);
      };
    }

    const catExportVcfBtn = container.querySelector('#export-category-vcf-btn');
    if (catExportVcfBtn) {
      catExportVcfBtn.onclick = () => {
        exportCardsVcf(targetCards, selectedCategory);
      };
    }

    const scanToCatBtn = container.querySelector('#scan-to-category-btn');
    if (scanToCatBtn) {
      scanToCatBtn.onclick = () => {
        setCurrentCategory(selectedCategory);
        window.location.hash = '#/scan';
      };
    }

    // Search input
    const searchInput = container.querySelector('#history-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        currentSearch = e.target.value;
        renderView();
      };
    }

    // Filter pills
    container.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.onclick = () => {
        activeFilter = btn.dataset.filter;
        renderView();
      };
    });

    // Card item click -> Open Detail Modal
    container.querySelectorAll('.contact-item').forEach((item) => {
      item.onclick = () => {
        const cardId = item.dataset.id;
        const targetCard = cards.find(c => c.id === cardId);
        if (targetCard) openCardDetailModal(targetCard);
      };
    });

    // Sync Now handler
    const syncBtn = container.querySelector('#sync-now-btn');
    if (syncBtn) {
      syncBtn.onclick = async () => {
        if (!navigator.onLine) {
          showToast('Cannot sync while device is offline.', 'error');
          return;
        }

        syncBtn.setAttribute('disabled', 'true');
        syncBtn.textContent = 'Syncing...';
        let syncedCount = 0;

        for (const card of pendingCards) {
          try {
            const res = await saveRecord(
              card.record,
              card.frontBase64 || null,
              card.backBase64 || null
            );
            await markCardSynced(card.id, {
              row: res.id,
              frontImageUrl: res.frontImageUrl,
              backImageUrl: res.backImageUrl
            });
            syncedCount++;
          } catch (err) {
            console.error('Failed to sync card:', card.id, err);
          }
        }

        showToast(`Sync complete! ${syncedCount} card(s) synced to TiDB Database.`, 'success', 3000);
        renderHistory(container);
      };
    }

    // Fetch from TiDB Cloud handler
    const fetchTiDbBtn = container.querySelector('#fetch-tidb-btn');
    if (fetchTiDbBtn) {
      fetchTiDbBtn.onclick = async () => {
        if (!navigator.onLine) {
          showToast('Device is offline. Connect to internet first.', 'error');
          return;
        }

        fetchTiDbBtn.setAttribute('disabled', 'true');
        showToast('Fetching cards from TiDB Cloud...', 'info', 2000);

        try {
          const res = await listCardsFromDB();
          const dbCards = res.cards || [];
          let imported = 0;
          for (const c of dbCards) {
            await saveCardLocal(c);
            imported++;
          }
          showToast(`Synced ${imported} card(s) from TiDB Cloud!`, 'success', 3000);
          renderHistory(container);
        } catch (err) {
          showToast(`TiDB fetch failed: ${err.message}`, 'error');
        } finally {
          fetchTiDbBtn.removeAttribute('disabled');
        }
      };
    }

    // Export All CSV button
    const exportAllCsvBtn = container.querySelector('#export-all-csv-btn');
    if (exportAllCsvBtn) {
      exportAllCsvBtn.onclick = () => {
        exportCardsCsv(cards, 'All');
      };
    }
  }

  function openCardDetailModal(card) {
    const rec = card.record || {};
    const phones = rec.phones || [];
    const emails = rec.emails || [];
    const websites = rec.websites || [];
    const cardCat = rec.category || card.category || 'General';

    openModal({
      title: rec.name || 'Card Details',
      contentHtml: `
        <div class="card-detail-content">
          ${card.frontBase64 ? `
            <div style="margin-bottom: 12px; text-align: center; cursor: pointer;" id="detail-photo-zoom">
              <img src="${card.frontBase64}" alt="Card" style="max-height: 140px; border-radius: var(--radius-md); border: 1px solid var(--border-color);" />
              <div style="font-size: 0.72rem; color: var(--accent-blue); margin-top: 4px;">Tap to zoom photo</div>
            </div>
          ` : ''}

          <div style="display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
            <span class="badge badge-ai" style="padding: 3px 8px;">Event: ${escapeHtml(cardCat)}</span>
            <span class="badge ${card.source === 'AI' ? 'badge-ai' : (card.source === 'vCard' ? 'badge-vcard' : 'badge-offline')}">Source: ${card.source}</span>
            <span class="badge ${card.status === 'pending' ? 'badge-pending' : 'badge-synced'}">${card.status}</span>
            ${rec.needsReview ? '<span class="badge badge-offline">Needs Review</span>' : ''}
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem;">
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">CATEGORY / EVENT:</strong> <span style="color: var(--accent-blue); font-weight: 700;">${escapeHtml(cardCat)}</span></div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">DESIGNATION:</strong> ${escapeHtml(rec.designation || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">COMPANY:</strong> ${escapeHtml(rec.company || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">PHONES:</strong> ${escapeHtml(phones.join(', ') || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">EMAIL:</strong> ${escapeHtml(emails.join(', ') || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">WEBSITE:</strong> ${escapeHtml(websites.join(', ') || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">ADDRESS:</strong> ${escapeHtml(rec.address || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">NOTES:</strong> ${escapeHtml(rec.notes || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">TAGS:</strong> ${escapeHtml(rec.tags ? (Array.isArray(rec.tags) ? rec.tags.join(', ') : rec.tags) : '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">SCANNED BY:</strong> ${escapeHtml(rec.scannedBy || '—')}</div>
          </div>

          <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
            <button type="button" id="share-vcard-btn" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <span>Download vCard (.vcf)</span>
            </button>
            <button type="button" id="delete-card-btn" class="btn btn-danger" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete Card</span>
            </button>
          </div>
        </div>
      `,
      onRender: (modalContainer, close) => {
        const photoZoom = modalContainer.querySelector('#detail-photo-zoom');
        if (photoZoom) {
          photoZoom.onclick = () => openImageZoomModal(card.frontBase64, rec.name || 'Card Photo');
        }

        // Share vCard
        const shareVcfBtn = modalContainer.querySelector('#share-vcard-btn');
        if (shareVcfBtn) {
          shareVcfBtn.onclick = () => exportCardsVcf([card], cardCat);
        }

        // Delete Card
        const delBtn = modalContainer.querySelector('#delete-card-btn');
        if (delBtn) {
          delBtn.onclick = async () => {
            if (confirm('Delete this card? (It will be removed locally and from TiDB Cloud)')) {
              await deleteCardLocal(card.id);
              if (navigator.onLine) {
                deleteCardFromDB(card.id).catch(console.warn);
              }
              showToast('Card deleted', 'info');
              close();
              renderHistory(container);
            }
          };
        }
      }
    });
  }

  renderView();
}

/**
 * Export cards as CSV with UTF-8 BOM (\uFEFF)
 * Ensures Bengali characters render properly in Microsoft Excel and Google Sheets
 * @param {Array<object>} cards
 * @param {string} [categoryName]
 */
export function exportCardsCsv(cards, categoryName = '') {
  if (!cards || cards.length === 0) {
    showToast('No cards to export', 'warning');
    return;
  }

  const headers = [
    'ID', 'Timestamp', 'Category', 'Name', 'Designation', 'Company',
    'Phone 1', 'Phone 2', 'Email', 'Website', 'Address',
    'Notes', 'Tags', 'Front Image', 'Back Image', 'Source',
    'Needs Review', 'Scanned By'
  ];

  const rows = cards.map((c) => {
    const r = c.record || {};
    const phones = r.phones || [];
    const emails = r.emails || [];
    const websites = r.websites || [];
    const cardCat = r.category || c.category || categoryName || 'General';

    return [
      r.id || c.id || '',
      r.timestamp || c.createdAt || '',
      cardCat,
      r.name || '',
      r.designation || '',
      r.company || '',
      phones[0] || '',
      phones[1] || '',
      emails[0] || '',
      websites[0] || '',
      r.address || '',
      r.notes || '',
      Array.isArray(r.tags) ? r.tags.join(', ') : (r.tags || ''),
      c.frontImageUrl || '',
      c.backImageUrl || '',
      c.source || '',
      r.needsReview ? 'TRUE' : 'FALSE',
      r.scannedBy || ''
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
  });

  // \uFEFF BOM byte order mark
  const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const prefix = categoryName ? categoryName.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') : 'Business_Cards';
  const filename = `${prefix}_${formatDateForFile(new Date())}.csv`;

  downloadBlob(blob, filename);
  showToast(`CSV downloaded: ${filename}`, 'success');
}

/**
 * Export cards as vCard .vcf format
 * @param {Array<object>} cards
 * @param {string} [categoryName]
 */
export function exportCardsVcf(cards, categoryName = '') {
  if (!cards || cards.length === 0) {
    showToast('No cards to export', 'warning');
    return;
  }

  const vcfEntries = cards.map((c) => {
    const r = c.record || {};
    const phones = r.phones || [];
    const emails = r.emails || [];
    const websites = r.websites || [];
    const cardCat = r.category || c.category || categoryName || 'General';

    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${r.name || 'Unnamed'}`,
      `N:${r.name || ''};;;;`
    ];

    if (r.company) lines.push(`ORG:${r.company}`);
    if (r.designation) lines.push(`TITLE:${r.designation}`);
    if (cardCat) lines.push(`CATEGORIES:${cardCat}`);
    phones.forEach(p => lines.push(`TEL;TYPE=CELL:${p}`));
    emails.forEach(e => lines.push(`EMAIL;TYPE=WORK:${e}`));
    websites.forEach(w => lines.push(`URL:${w}`));
    if (r.address) lines.push(`ADR;TYPE=WORK:;;${r.address};;;;`);
    if (r.notes) lines.push(`NOTE:${r.notes}`);
    lines.push('END:VCARD');

    return lines.join('\r\n');
  });

  const vcfContent = vcfEntries.join('\r\n\r\n');
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
  const prefix = categoryName ? categoryName.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') : 'Contacts';
  const filename = `${prefix}_${formatDateForFile(new Date())}.vcf`;

  downloadBlob(blob, filename);
  showToast('vCard (.vcf) downloaded', 'success');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateForFile(d) {
  return d.toISOString().slice(0, 10);
}

function formatDateFriendly(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
