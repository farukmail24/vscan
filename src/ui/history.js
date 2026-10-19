/**
 * History Screen Component
 * Browses saved cards from IndexedDB, searches and filters,
 * triggers offline card sync, re-extracts with AI, and exports to CSV (UTF-8 BOM) and vCard (.vcf).
 */

import { getAllCardsLocal, getPendingCards, markCardSynced, deleteCardLocal, saveCardLocal } from '../db.js';
import { saveRecord, extractWithAI, updateRecord } from '../api.js';
import { setPendingCount } from '../store.js';
import { openModal, openImageZoomModal } from './modal.js';
import { showToast } from './toast.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export async function renderHistory(container) {
  const cards = await getAllCardsLocal();
  const pendingCards = cards.filter(c => c.status === 'pending');
  setPendingCount(pendingCards.length);

  let currentSearch = '';
  let activeFilter = 'all'; // 'all' | 'pending' | 'review' | 'ai' | 'offline'

  function renderView() {
    const filtered = cards.filter((card) => {
      const rec = card.record || {};
      const q = currentSearch.toLowerCase();
      const matchesSearch = !q ||
        (rec.name || '').toLowerCase().includes(q) ||
        (rec.company || '').toLowerCase().includes(q) ||
        (rec.designation || '').toLowerCase().includes(q) ||
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

        <!-- Search Bar -->
        <div style="margin-bottom: 12px; position: relative;">
          <input type="search" id="history-search" class="form-input" style="padding-left: 36px;" placeholder="Search by name, company, phone, email..." value="${escapeHtml(currentSearch)}" />
          <span style="position: absolute; left: 12px; top: 13px; color: var(--text-muted); pointer-events: none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
        </div>

        <!-- Filter Pills & Export Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 6px; overflow-x: auto; padding-bottom: 4px;">
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-sm btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all">All (${cards.length})</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" data-filter="pending">Pending (${pendingCards.length})</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'review' ? 'btn-primary' : 'btn-secondary'}" data-filter="review">Needs Review</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'ai' ? 'btn-primary' : 'btn-secondary'}" data-filter="ai">AI</button>
            <button type="button" class="btn-sm btn ${activeFilter === 'offline' ? 'btn-primary' : 'btn-secondary'}" data-filter="offline">Offline</button>
          </div>

          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button type="button" id="export-csv-btn" class="btn-icon" title="Export as CSV (Excel compatible with UTF-8 BOM)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span style="font-size: 0.72rem; font-weight: 600; margin-left: 4px;">CSV</span>
            </button>
            <button type="button" id="export-vcf-btn" class="btn-icon" title="Export as vCard (.vcf)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span style="font-size: 0.72rem; font-weight: 600; margin-left: 4px;">vCard</span>
            </button>
          </div>
        </div>

        <!-- Cards List -->
        <div id="cards-list-container">
          ${filtered.length === 0 ? `
            <div class="card-panel" style="text-align: center; padding: 30px 16px;">
              <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px;">No matching business cards found</div>
              <p style="font-size: 0.8rem; color: var(--text-muted);">
                ${currentSearch ? 'Try a different search query or clear the filter.' : 'Captured cards will appear here.'}
              </p>
            </div>
          ` : `
            ${filtered.map(card => {
              const rec = card.record || {};
              const firstLetter = (rec.name || rec.company || '?').charAt(0).toUpperCase();
              const primaryPhone = (rec.phones && rec.phones[0]) || '';
              const primaryEmail = (rec.emails && rec.emails[0]) || '';

              return `
                <div class="contact-item" data-id="${card.id}">
                  <div class="contact-avatar">
                    ${card.frontBase64 ? `
                      <img src="${card.frontBase64}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);" />
                    ` : firstLetter}
                  </div>

                  <div class="contact-info">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                      <span class="contact-name">${escapeHtml(rec.name || 'Unnamed Contact')}</span>
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
      </div>
    `;

    // Bind event handlers
    const searchInput = container.querySelector('#history-search');
    searchInput.oninput = (e) => {
      currentSearch = e.target.value;
      renderView();
    };

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
            const res = await saveRecord(card.record, card.frontBase64, card.backBase64);
            await markCardSynced(card.id, {
              row: res.row,
              frontImageUrl: res.frontImageUrl,
              backImageUrl: res.backImageUrl
            });
            syncedCount++;
          } catch (err) {
            console.error('Failed to sync card:', card.id, err);
          }
        }

        showToast(`Sync complete! ${syncedCount} card(s) synced to Sheet.`, 'success', 3000);
        renderHistory(container);
      };
    }

    // Export CSV handler (UTF-8 BOM for Excel Bengali compatibility)
    container.querySelector('#export-csv-btn').onclick = () => {
      exportCardsCsv(filtered);
    };

    // Export vCard handler
    container.querySelector('#export-vcf-btn').onclick = () => {
      exportCardsVcf(filtered);
    };
  }

  function openCardDetailModal(card) {
    const rec = card.record || {};
    const phones = rec.phones || [];
    const emails = rec.emails || [];
    const websites = rec.websites || [];

    const isOffline = card.source === 'Offline';
    const canReExtract = isOffline && card.frontBase64 && navigator.onLine;

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

          <div style="display: flex; gap: 6px; margin-bottom: 14px;">
            <span class="badge ${card.source === 'AI' ? 'badge-ai' : (card.source === 'vCard' ? 'badge-vcard' : 'badge-offline')}">Source: ${card.source}</span>
            <span class="badge ${card.status === 'pending' ? 'badge-pending' : 'badge-synced'}">${card.status}</span>
            ${rec.needsReview ? '<span class="badge badge-offline">Needs Review</span>' : ''}
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem;">
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">DESIGNATION:</strong> ${escapeHtml(rec.designation || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">COMPANY:</strong> ${escapeHtml(rec.company || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">PHONES:</strong> ${escapeHtml(phones.join(', ') || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">EMAIL:</strong> ${escapeHtml(emails.join(', ') || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">WEBSITE:</strong> ${escapeHtml(websites.join(', ') || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">ADDRESS:</strong> ${escapeHtml(rec.address || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">NOTES:</strong> ${escapeHtml(rec.notes || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">TAGS:</strong> ${escapeHtml(rec.tags || '—')}</div>
            <div><strong style="color: var(--text-muted); font-size: 0.78rem;">SCANNED BY:</strong> ${escapeHtml(rec.scannedBy || '—')}</div>
          </div>

          <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
            ${canReExtract ? `
              <button type="button" id="re-extract-btn" class="btn btn-secondary">
                ✨ Re-extract with Gemini AI
              </button>
            ` : ''}
            <button type="button" id="share-vcard-btn" class="btn btn-secondary">
              Share / Download vCard
            </button>
            <button type="button" id="delete-card-btn" class="btn btn-danger">
              Delete Card
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
        const vcardBtn = modalContainer.querySelector('#share-vcard-btn');
        if (vcardBtn) {
          vcardBtn.onclick = () => {
            exportCardsVcf([card]);
          };
        }

        // Re-extract with Gemini AI
        const reExtractBtn = modalContainer.querySelector('#re-extract-btn');
        if (reExtractBtn) {
          reExtractBtn.onclick = async () => {
            reExtractBtn.setAttribute('disabled', 'true');
            reExtractBtn.textContent = 'Extracting with Gemini...';
            try {
              const res = await extractWithAI(card.frontBase64, card.backBase64);
              const aiData = res.data;

              // Normalize phones
              const normalizedPhones = (aiData.phones || []).map(p => {
                const parsed = parsePhoneNumberFromString(p, 'BD');
                return parsed && parsed.isValid() ? parsed.format('E.164') : p;
              });

              card.record = {
                ...card.record,
                ...aiData,
                phones: normalizedPhones,
                source: 'AI (Re-extracted)',
                needsReview: false
              };
              card.source = 'AI';

              // If already synced, update Sheet
              if (card.status === 'synced') {
                await updateRecord(card.id, card.record);
              }

              await saveCardLocal(card);
              showToast('Re-extracted with AI and updated!', 'success');
              close();
              renderHistory(container);
            } catch (err) {
              showToast(`AI extraction failed: ${err.message}`, 'error');
              reExtractBtn.removeAttribute('disabled');
              reExtractBtn.textContent = '✨ Re-extract with Gemini AI';
            }
          };
        }

        // Delete Card
        const delBtn = modalContainer.querySelector('#delete-card-btn');
        if (delBtn) {
          delBtn.onclick = async () => {
            if (confirm('Delete this card from local storage?')) {
              await deleteCardLocal(card.id);
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
 */
function exportCardsCsv(cards) {
  if (!cards || cards.length === 0) {
    showToast('No cards to export', 'warning');
    return;
  }

  const headers = [
    'ID', 'Timestamp', 'Name', 'Designation', 'Company',
    'Phone 1', 'Phone 2', 'Email', 'Website', 'Address',
    'Notes', 'Tags', 'Front Image', 'Back Image', 'Source',
    'Needs Review', 'Scanned By'
  ];

  const rows = cards.map((c) => {
    const r = c.record || {};
    const phones = r.phones || [];
    const emails = r.emails || [];
    const websites = r.websites || [];

    return [
      r.id || c.id || '',
      r.timestamp || c.createdAt || '',
      r.name || '',
      r.designation || '',
      r.company || '',
      phones[0] || '',
      phones[1] || '',
      emails[0] || '',
      websites[0] || '',
      r.address || '',
      r.notes || '',
      r.tags || '',
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
  downloadBlob(blob, `Business_Cards_${formatDateForFile(new Date())}.csv`);
  showToast('CSV downloaded with UTF-8 BOM', 'success');
}

/**
 * Export cards as vCard .vcf format
 */
function exportCardsVcf(cards) {
  if (!cards || cards.length === 0) {
    showToast('No cards to export', 'warning');
    return;
  }

  const vcfEntries = cards.map((c) => {
    const r = c.record || {};
    const phones = r.phones || [];
    const emails = r.emails || [];
    const websites = r.websites || [];

    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${r.name || 'Unnamed'}`,
      `N:${r.name || ''};;;;`
    ];

    if (r.company) lines.push(`ORG:${r.company}`);
    if (r.designation) lines.push(`TITLE:${r.designation}`);
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
  const filename = cards.length === 1
    ? `${(cards[0].record?.name || 'Contact').replace(/\s+/g, '_')}.vcf`
    : `Business_Cards_${formatDateForFile(new Date())}.vcf`;

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
