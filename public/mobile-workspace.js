/**
 * Market Desk Mobile Workspace Controller
 * Handles compact/phone breakpoints, unified overlay management,
 * history state ownership, view state preservation, and recent search history.
 */

export const RECENT_SYMBOLS_KEY = 'market-desk-recent-symbols';
export const MAX_RECENT_SYMBOLS = 10;

/**
 * Check if the layout is phone (<768px)
 */
export function isPhone(width = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  return width < 768;
}

/**
 * Check if the layout is compact (<1024px)
 */
export function isCompact(width = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  return width < 1024;
}

/**
 * Recent Symbols Manager
 */
export function getRecentSymbols(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_SYMBOLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_SYMBOLS) : [];
  } catch (_) {
    return [];
  }
}

export function addRecentSymbol(sym, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!sym || typeof sym !== 'string' || !storage) return [];
  const clean = sym.trim().toUpperCase();
  if (!clean) return [];

  try {
    const current = getRecentSymbols(storage).filter(s => s !== clean);
    current.unshift(clean);
    const updated = current.slice(0, MAX_RECENT_SYMBOLS);
    storage.setItem(RECENT_SYMBOLS_KEY, JSON.stringify(updated));
    return updated;
  } catch (_) {
    return [];
  }
}

export function clearRecentSymbols(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return [];
  try {
    storage.removeItem(RECENT_SYMBOLS_KEY);
  } catch (_) {}
  return [];
}

/**
 * Scroll Lock Manager for sheets/modals without layout jump
 */
let savedScrollY = 0;
let isScrollLocked = false;

export function lockBodyScroll() {
  if (typeof document === 'undefined' || isScrollLocked) return;
  savedScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  isScrollLocked = true;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined' || !isScrollLocked) return;
  isScrollLocked = false;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  if (typeof window !== 'undefined') {
    window.scrollTo(0, savedScrollY);
  }
}

/**
 * History & Navigation State Helper
 */
export function createHistoryState({ page, symbol, sourcePage = null, overlay = null }) {
  return {
    owner: 'market-desk',
    version: 1,
    page: page || 'overview',
    symbol: symbol || '',
    sourcePage: sourcePage || null,
    overlay: overlay || null
  };
}

/**
 * View state memory cache (in-memory per session)
 */
const viewStateCache = new Map();

export function captureViewState(key, data) {
  if (!key) return;
  viewStateCache.set(key, {
    ...(viewStateCache.get(key) || {}),
    ...data,
    updatedAt: Date.now()
  });
}

export function getViewState(key) {
  return viewStateCache.get(key) || null;
}

export function clearViewState(key) {
  if (key) viewStateCache.delete(key);
  else viewStateCache.clear();
}
