export type DirectionId = '0' | '1';
export type Coordinate = [number, number];

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sequence?: number;
}

export interface RouteDirection {
  id: DirectionId;
  label: string;
  headsign: string;
  shape: Coordinate[];
  stops: Stop[];
}

export interface RouteData {
  id: string;
  name: string;
  directions: RouteDirection[];
  feedVersion: string;
  validFrom: string;
  validThrough: string;
  sourceUrl: string;
}

export interface ServiceWindow {
  days: number[];
  startTime: string;
  endTime: string;
}

export interface DetourAlert {
  id: string;
  title: string;
  directionIds: DirectionId[];
  startsAt: string | null;
  endsAt: string | null;
  schedule: ServiceWindow | null;
  rawText: string;
  sourceUrl: string;
  timingIssues: string[];
  geometryIssues: string[];
  sourceIssues: string[];
  geometry: Coordinate[][];
  unservedGeometry: Coordinate[][];
  candidateGeometry?: Coordinate[];
  skippedStopIds: string[];
  stopCoverage: 'explicit-list' | 'partial-list' | 'unknown';
  boardingNote?: { text: string; sourceUrl: string; precision: 'area-only' };
}

export interface FeedSource {
  name: string;
  url: string;
  fetchedAt: string | null;
  ok: boolean;
  error?: string;
}

export interface AlertFeed {
  routeId: string;
  alerts: DetourAlert[];
  fetchedAt: string;
  // Publication time orders complete and failed collection attempts; it never establishes source freshness.
  collectedAt?: string;
  mode: 'live' | 'snapshot';
  complete: boolean;
  sources: FeedSource[];
  warnings: string[];
}

// Only add an entry when an agency source explicitly identifies the boarding
// point for these alerts. A nearby stop or bus GPS position is insufficient.
export interface VerifiedBoarding {
  stopId: string;
  forAlertIds: string[];
  sourceUrl: string;
  verifiedAt: string;
  validUntil: string;
  verification: 'agency-explicit';
  note: string;
}

export type AlertTiming = 'active' | 'inactive' | 'uncertain';
export interface EvaluatedAlert {
  alert: DetourAlert;
  timing: AlertTiming;
  affectsSelectedStop: boolean;
  stopScope: 'selected' | 'elsewhere' | 'unknown';
  reason: string;
}

export interface StopAssessment {
  status: 'affected' | 'unaffected' | 'unknown';
  title: string;
  summary: string;
  reasons: string[];
  relevantAlerts: EvaluatedAlert[];
  alternative: (VerifiedBoarding & { stop: Stop }) | null;
  fresh: boolean;
}

export interface AssessmentInput {
  feed: AlertFeed;
  route: RouteData;
  directionId: DirectionId;
  stopId: string;
  now: Date;
  boarding?: VerifiedBoarding[];
  maxAgeMs?: number;
  // Replay is always labeled as recorded in the UI; it can evaluate old data
  // at a historical time without pretending it describes today's service.
  replay?: boolean;
}
