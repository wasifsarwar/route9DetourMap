import { useId, useRef, useState } from 'react';
import type { Stop } from '../domain/types';
import { searchStops } from '../domain/stopSearch';
import { Icon } from './Icon';

export function StopSearch({ stops, stop, onSelect }: { stops: Stop[]; stop: Stop; onSelect: (id: string) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = searchStops(stops, query);
  const activeIndex = Math.min(active, matches.length - 1);
  function choose(item: Stop) {
    onSelect(item.id);
    setOpen(false);
    setQuery('');
    input.current?.focus();
  }
  return <div className="stop-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(''); }
  }}>
    <label htmlFor={id}>Your stop</label>
    <div className="stop-search__field"><Icon name="pin" />
      <input ref={input} id={id} role="combobox" autoComplete="off" spellCheck={false}
        aria-expanded={open} aria-controls={`${id}-results`} aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
        value={open ? query : stop.name} placeholder="Search street or intersection"
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => { if (!open) { setOpen(true); setActive(0); } }}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(''); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(open ? Math.max(0, Math.min(matches.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))) : 0);
          }
          if (event.key === 'Enter' && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
        }} />
    </div>
    {open && <div className="stop-search__results">
      <p role="status">{matches.length ? `${matches.length} stops · Choose a stop` : 'No matching stops. Try another street.'}</p>
      <ul id={`${id}-results`} role="listbox" aria-label="Matching stops">
        {matches.map((item, index) => <li key={item.id} id={`${id}-${index}`} role="option"
          aria-selected={index === activeIndex} onMouseDown={event => event.preventDefault()}
          onClick={() => choose(item)} ref={element => { if (open && index === activeIndex && element?.parentElement) { const list = element.parentElement; const top = element.offsetTop - list.offsetTop; if (top < list.scrollTop) list.scrollTop = top; else if (top + element.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + element.offsetHeight - list.clientHeight; } }}>
          {item.name}{item.id === stop.id && <small>Selected</small>}
        </li>)}
      </ul>
    </div>}
  </div>;
}
