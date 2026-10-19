/**
 * In-memory scan state store
 * Coordinates state between Scan, Review, and History screens
 */

let state = {
  currentScan: null,
  batchCount: 0,
  pendingCount: 0
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.error('Store listener error:', e);
    }
  });
}

/**
 * Set the currently active scan data for review
 */
export function setCurrentScan(scanData) {
  state.currentScan = scanData;
  notify();
}

/**
 * Clear current scan state (after save or discard)
 */
export function clearCurrentScan() {
  state.currentScan = null;
  notify();
}

/**
 * Increment batch scan count
 */
export function incrementBatchCount() {
  state.batchCount += 1;
  notify();
}

/**
 * Reset batch scan count
 */
export function resetBatchCount() {
  state.batchCount = 0;
  notify();
}

/**
 * Update pending sync count badge
 */
export function setPendingCount(count) {
  state.pendingCount = count;
  notify();
}
