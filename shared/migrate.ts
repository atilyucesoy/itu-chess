import { suggestedSemester, type State } from "./types.js";

type LegacyState = Omit<State, "semesters" | "activeSemester"> &
  Partial<Pick<State, "semesters" | "activeSemester">>;

// Add metadata only: never rename existing semester labels or alter events,
// ratings, managers, audit entries or the relationship between events and points.
export function migrateState(state: LegacyState): State {
  const latest = [...state.tournaments].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];
  const activeSemester =
    state.activeSemester ||
    latest?.semester ||
    state.semesters?.[0] ||
    suggestedSemester();
  const semesters = [
    ...new Set([
      ...(state.semesters ?? []),
      ...state.tournaments.map((t) => t.semester),
      activeSemester,
    ]),
  ];
  if (
    state.activeSemester === activeSemester &&
    JSON.stringify(state.semesters) === JSON.stringify(semesters)
  )
    return state as State;
  return { ...state, semesters, activeSemester };
}
