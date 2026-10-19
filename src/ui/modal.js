/**
 * Modal & Image Zoom Utility
 */

export function openModal({ title, contentHtml, onRender, onClose }) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${title || ''}</h3>
        <button id="modal-close-btn" class="btn-icon" aria-label="Close modal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        ${contentHtml}
      </div>
    </div>
  `;

  container.style.display = 'flex';

  const close = () => {
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  };

  container.querySelector('#modal-close-btn').onclick = close;
  container.onclick = (e) => {
    if (e.target === container) close();
  };

  if (onRender) onRender(container, close);
  return close;
}

export function openImageZoomModal(imageUrl, caption = 'Card Preview') {
  openModal({
    title: caption,
    contentHtml: `
      <div style="text-align: center;">
        <img src="${imageUrl}" alt="${caption}" style="max-width: 100%; max-height: 70vh; border-radius: var(--radius-md); object-fit: contain; box-shadow: var(--shadow-md);" />
      </div>
    `
  });
}
