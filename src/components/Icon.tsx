type IconName = 'refresh' | 'pin' | 'frame' | 'arrow';
const paths: Record<IconName, string> = {
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6.1 7a7 7 0 0 1 11.6-1L20 9 M4 15l2.3 3A7 7 0 0 0 18 17',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  frame: 'M9 4H4v5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  arrow: 'M7 17 17 7 M7 7h10v10',
};

export function Icon({ name }: { name: IconName }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
