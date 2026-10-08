import { useSyncExternalStore } from 'react';

const query = '(max-width: 700px)';
function subscribe(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}
/** Match the CSS breakpoint while mounting only one stop-status result. */
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
