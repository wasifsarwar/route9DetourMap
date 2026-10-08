import { useId, useRef } from 'react';
import type { AlertFeed, RouteData, RouteDirection, Stop } from '../domain/types';
import { Icon } from './Icon';
import { NearbyStopsPanel, useNearbyStops } from './NearbyStops';
import { StopSearch } from './StopSearch';
import './StopPicker.css';

type StopPickerProps = {
  route: RouteData;
  direction: RouteDirection;
  stop: Stop;
  feed: AlertFeed;
  now: Date;
  onSelect: (id: string) => void;
  replay: boolean;
};

function DirectionStopPicker({ route, direction, stop, feed, now, onSelect, replay }: StopPickerProps) {
  const nearbyId = useId();
  const nearButton = useRef<HTMLButtonElement>(null);
  const nearby = useNearbyStops();
  function dismissNearby() {
    nearby.clear();
    requestAnimationFrame(() => nearButton.current?.focus());
  }
  return <div className="combined-stop-picker" onKeyDown={event => {
    if (event.key === 'Escape' && nearby.open) { event.preventDefault(); dismissNearby(); }
  }}>
    <StopSearch stops={direction.stops} stop={stop} onSelect={id => { nearby.clear(); onSelect(id); }}
      onOpenChange={open => { if (open) nearby.clear(); }}
      action={<button ref={nearButton} className="combined-stop-picker__near" type="button" disabled={replay || nearby.loading}
        title={replay ? 'Nearby stops are unavailable in replay' : 'Find stops near me'}
        aria-label={nearby.loading ? 'Finding nearby stops' : replay ? 'Nearby stops unavailable in replay' : 'Find stops near me'}
        aria-expanded={nearby.open} aria-controls={nearby.open ? nearbyId : undefined}
        onClick={() => { void nearby.locate(); }}><Icon name="pin" /><span>Near me</span></button>} />
    {!replay && nearby.open && <div id={nearbyId} className="combined-stop-picker__results">
      <NearbyStopsPanel route={route} direction={direction} feed={feed} now={now} onSelect={onSelect} state={nearby} onDismiss={dismissNearby} />
    </div>}
  </div>;
}

export function StopPicker(props: StopPickerProps) {
  return <DirectionStopPicker key={`${props.direction.id}-${props.replay}`} {...props} />;
}
