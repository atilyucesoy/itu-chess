# Architecture and trade-offs

## Scope

The application is designed for one university chess club, with approximately 30–40 players per weekly event. It is not a multi-tenant platform or an officially endorsed FIDE tournament handler. A browser client is read-only unless an organizer signs in.

```text
React / TypeScript interface
          │ JSON API, signed HttpOnly session cookie
          ▼
Express server ───────► bbpPairings 6.0.0 process
          │             fixed-width TRF input / validated pair output
          │
          ├── actual club: SQLite or private Supabase Postgres
          │                 versioned state + compare-and-swap save
          │
          └── developer sandbox: owner-bound, in-memory state
                                 no persistent writes
```

## Pairing is separate from rating

The application does not implement an approximate Swiss algorithm. It exports an event to TRF, invokes the pinned Dutch engine and validates the returned player identities and coverage. Engine failure is surfaced to the organizer; no improvised fallback pairings are produced. The release download is verified by SHA-256.

The pairing engine uses the tournament's scores, pairing numbers, colour history, floats and bye eligibility. Club Elo is used for **initial seeding**, not as a rule to always pair the closest ratings.

At event start, participants receive immutable snapshots of their name, official rating, club rating and effective seed:

```text
effective seed = İTÜ Elo ?? entered official Elo/UKD ?? reference
```

The club rating always takes priority once established. A later player-profile edit cannot silently alter pairings already played. Historical TRFs use ASCII player identifiers so Turkish names do not disturb fixed-width fields; the interface retains the original names.

## A separate club rating model

Official Elo/UKD is manually maintained and never modified by club game results. Club ratings use a documented logistic Elo expectation, configurable K-factors and an explicit policy snapshot for each event. The initial rating for an unrated player may be a smoothed performance estimate. The exact formulas and their limitations are documented in the main README.

Byes and unplayed forfeits are excluded from rating updates. Ratings are computed after finalization using frozen event-start rating values. This avoids order-dependent per-result updates while results are being entered.

Completed rated events and owner corrections form a timestamped replay history. An explicit owner action can recalculate ratings under a changed policy without rewriting old pairings or standings snapshots. Only one rated event can be live at a time, preventing simultaneous events from committing incompatible rating histories.

## Standings and semester points

Tournament ranking and season points are different computations:

1. A tournament ranks participants by score, Buchholz Cut-1, Buchholz, Sonneborn-Berger and a recorded random lot for any remaining complete ties.
2. Semester standings sum the F1-style points from completed, included events. Ties use finishing-position countback; completely identical records share a season rank.

The supported bye, forfeit and withdrawal cases have explicit tie-break adjustments rather than treating every unplayed round as an ordinary game. Live tie-break values are provisional. Standard tournaments independently opt into club rating calculations and semester points, so casual events can be excluded without introducing a variant selector.

Semester labels are centrally registered, with an explicit owner-controlled active period. The header and new-event defaults use that active period; historical standings use an independent viewing selection. Rollover does not reassign old events, reset club ratings or alter past points. A one-time, idempotent migration preserves all legacy labels and records and adds only the missing registry metadata. Backup restoration uses the same normalization.

## Presentation and projection

The browser stores palette (brown/green) separately from light/dark mode. These preferences are local presentation state, not club-wide settings.

A separate read-only hash route renders projected pairings without navigation or editing controls. It displays the same frozen entry ratings and the same round data as the tournament desk. Responsive capacity and pagination avoid hiding later boards when screen height or long names reduce available room. A standard 40-player field is browser-tested at 1920×1080 with all 20 boards visible. Native fullscreen is optional; the layout also fills the page without it. The default round selector follows the latest round as the shared 20-second polling refreshes data, while explicitly selected historical rounds remain fixed.

## Persistence and concurrent edits

The persistent store is one versioned JSON document. SQLite performs an atomic `UPDATE ... WHERE revision = ?`; Supabase uses an equivalent private Postgres RPC. Browser writes include the revision they were based on. A conflicting write is rejected, not silently merged or overwritten.

This is a deliberate small-club trade-off: keeping event finalization, rating replay, points and audit metadata in one atomic document reduces partial-update cases. It also means reads load the whole document, and unrelated edits can conflict. A larger deployment would need normalized tables, finer-grained concurrency controls and migrations.

Finalization cannot be repeated. Corrections to earlier rounds require explicitly undoing subsequent rounds; reopening older rated events is restricted when later rated events remain finalized. These constraints favor reproducible history over unrestricted editing.

## Disposable developer workspaces

Developer mode is opt-in and hard-disabled in production. An owner can open an empty in-memory workspace using the current rating policy and semester configuration. It copies no actual players or accounts.

The server validates both the workspace cookie and the workspace identifier on every mutation. A missing/expired sandbox must not redirect a stale test write to the actual club. Reset increments the sandbox revision; disposal invalidates its store so in-flight saves cannot resurrect deleted test state.

Reset, exit, logout, expiration and server restart remove test state. Sandbox actions do not write to the club database, real rating/points history, persistent audit or owner backups. Tests compare the actual club backup before and after an entire sandbox tournament to verify this isolation. Explicitly downloaded files and operating-system forensic retention are outside this application-level guarantee.

## Verification and current limits

- Unit and integration tests invoke the actual engine for full even/odd seven-round tournaments and check rating/standings behavior.
- Playwright exercises desktop/mobile tournament management, organizer permissions, edit conflicts and sandbox isolation.
- GitHub Actions runs the test suite and production build on pushes and pull requests.
- Hosted Supabase connectivity still requires deployment-time verification with the project owner's credentials; local tests do not imply that a remote deployment has been tested.
- There is no live public deployment yet. Late entries after round one and changing the round count mid-event are intentionally outside the current release.
