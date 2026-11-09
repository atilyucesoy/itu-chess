export interface Policy {
  reference: number;
  initialMethod: "performance" | "seed";
  provisionalGames: number;
  provisionalK: number;
  establishedK: number;
  // Missing on legacy event snapshots = disabled, preserving past calculations.
  initialPerformanceCapEnabled?: boolean;
  initialPerformanceCap?: number;
}
export const DEFAULT_POLICY: Policy = {
  reference: 1500,
  initialMethod: "performance",
  provisionalGames: 30,
  provisionalK: 40,
  establishedK: 20,
  initialPerformanceCapEnabled: false,
  initialPerformanceCap: 1900,
};
export const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export type Result =
  "1-0" | "0-1" | "1/2" | "+-" | "-+" | "--" | "bye" | "absent";
export interface Player {
  id: string;
  name: string;
  official: number | null;
  officialType: "ELO" | "UKD";
  itu: number | null;
  games: number;
  createdAt: string;
  // Archived players stay in every historical record and profile, but are no
  // longer offered when picking participants. Absent = active.
  archivedAt?: string;
}
export interface Entry {
  playerId: string;
  name: string;
  official: number | null;
  officialType: "ELO" | "UKD";
  itu: number | null;
  seed: number;
  number: number;
  withdrawn: boolean;
  // First round this participant may be paired in; absent on legacy entries = 1.
  joinedRound?: number;
}
export interface Game {
  board: number;
  white: string;
  black: string | null;
  result: Result | null;
}
export interface Round {
  number: number;
  games: Game[];
  trf: string;
  engine: string;
}
export interface RatingChange {
  playerId: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  games: number;
}
export interface Tournament {
  id: string;
  name: string;
  date: string;
  semester: string;
  roundsPlanned: number;
  timeControl: string;
  // Retained only for backwards-compatible historical backups.
  variant?: string;
  countsPoints: boolean;
  countsRating: boolean;
  status: "draft" | "live" | "finished";
  entries: Entry[];
  rounds: Round[];
  policy: Policy;
  initialColor: "w" | "b";
  finalizedAt: string | null;
  ratingChanges: RatingChange[];
  // Manual lot order only resolves otherwise identical standings, never engine seeding.
  lotOrder: string[];
  createdAt: string;
}
export interface Standing {
  playerId: string;
  name: string;
  number: number;
  score: number;
  bh: number;
  bhCut: number;
  sb: number;
  rank: number;
  tied: boolean;
  itu: number | null;
  official: number | null;
  officialType: "ELO" | "UKD";
}
export interface Audit {
  at: string;
  by: string;
  action: string;
}
export interface Override {
  id: string;
  playerId: string;
  value: number;
  at: string;
  reason: string;
}
export interface PublicState {
  semesters: string[];
  activeSemester: string;
  players: Player[];
  tournaments: Tournament[];
  policy: Policy;
  overrides: Override[];
  audit: Audit[];
}
export interface Manager {
  id: string;
  username: string;
  name: string;
  role: "owner" | "organizer";
  passwordHash: string;
}
export interface State extends PublicState {
  managers: Manager[];
}
export interface Snapshot {
  revision: number;
  state: State;
}
export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: "owner" | "organizer";
}
export function emptyState(): State {
  const semester = suggestedSemester();
  return {
    semesters: [semester],
    activeSemester: semester,
    players: [],
    tournaments: [],
    policy: { ...DEFAULT_POLICY },
    overrides: [],
    audit: [],
    managers: [],
  };
}
// One-time suggestion for a fresh installation, not an automatic rollover rule.
export function suggestedSemester(now = new Date()) {
  const year = now.getFullYear();
  return now.getMonth() >= 7
    ? `${year}–${year + 1} Güz`
    : `${year - 1}–${year} Bahar`;
}
export function effectiveRating(
  p: Pick<Player, "itu" | "official">,
  reference: number,
) {
  return p.itu ?? p.official ?? reference;
}
export function scoreOf(result: Result | null, white: boolean): number {
  if (result === "bye") return white ? 1 : 0;
  if (result === "1/2") return 0.5;
  if (result === "1-0" || result === "+-") return white ? 1 : 0;
  if (result === "0-1" || result === "-+") return white ? 0 : 1;
  return 0;
}
export function played(result: Result | null) {
  return result === "1-0" || result === "0-1" || result === "1/2";
}
