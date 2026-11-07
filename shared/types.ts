export interface Policy {
  reference: number;
  initialMethod: "performance" | "seed";
  provisionalGames: number;
  provisionalK: number;
  establishedK: number;
}
export const DEFAULT_POLICY: Policy = {
  reference: 1500,
  initialMethod: "performance",
  provisionalGames: 30,
  provisionalK: 40,
  establishedK: 20,
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
  variant: "standard" | "chess960";
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
  return {
    players: [],
    tournaments: [],
    policy: { ...DEFAULT_POLICY },
    overrides: [],
    audit: [],
    managers: [],
  };
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
