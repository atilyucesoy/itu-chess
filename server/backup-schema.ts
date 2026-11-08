import { z } from "zod";
import { policySchema } from "./domain.js";
const result = z
  .enum(["1-0", "0-1", "1/2", "+-", "-+", "--", "bye", "absent"])
  .nullable();
const rating = z.number().int().min(100).max(3500).nullable();
const officialType = z.enum(["ELO", "UKD"]);
export const backupSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    state: z.object({
      semesters: z.array(z.string().min(1).max(120)).min(1).optional(),
      activeSemester: z.string().min(1).max(120).optional(),
      policy: policySchema,
      players: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          official: rating,
          officialType,
          itu: rating,
          games: z.number().int().nonnegative(),
          createdAt: z.iso.datetime(),
        }),
      ),
      managers: z
        .array(
          z.object({
            id: z.string(),
            username: z.string(),
            name: z.string(),
            role: z.enum(["owner", "organizer"]),
            passwordHash: z.string().regex(/^[0-9a-f]{32}:[0-9a-f]{128}$/),
          }),
        )
        .min(1),
      overrides: z.array(
        z.object({
          id: z.string(),
          playerId: z.string(),
          value: z.number().int().min(100).max(3500),
          reason: z.string(),
          at: z.iso.datetime(),
        }),
      ),
      audit: z.array(
        z.object({ at: z.iso.datetime(), by: z.string(), action: z.string() }),
      ),
      tournaments: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          date: z.iso.date(),
          semester: z.string(),
          roundsPlanned: z.number().int().min(1).max(15),
          timeControl: z.string(),
          variant: z.string().optional(),
          countsPoints: z.boolean(),
          countsRating: z.boolean(),
          status: z.enum(["draft", "live", "finished"]),
          entries: z.array(
            z.object({
              playerId: z.string(),
              name: z.string(),
              official: rating,
              officialType,
              itu: rating,
              seed: z.number().int().min(100).max(3500),
              number: z.number().int().nonnegative(),
              withdrawn: z.boolean(),
              joinedRound: z.number().int().min(1).max(15).optional(),
            }),
          ),
          rounds: z.array(
            z.object({
              number: z.number().int().positive(),
              engine: z.string(),
              trf: z.string(),
              games: z.array(
                z.object({
                  board: z.number().int().nonnegative(),
                  white: z.string(),
                  black: z.string().nullable(),
                  result,
                }),
              ),
            }),
          ),
          policy: policySchema,
          initialColor: z.enum(["w", "b"]),
          finalizedAt: z.iso.datetime().nullable(),
          ratingChanges: z.array(
            z.object({
              playerId: z.string(),
              before: rating,
              after: rating,
              delta: z.number().nullable(),
              games: z.number().int().nonnegative(),
            }),
          ),
          lotOrder: z.array(z.string()),
          createdAt: z.iso.datetime(),
        }),
      ),
    }),
  })
  .superRefine((backup, ctx) => {
    const s = backup.state;
    if (
      s.semesters &&
      (new Set(s.semesters).size !== s.semesters.length ||
        !s.activeSemester ||
        !s.semesters.includes(s.activeSemester) ||
        s.tournaments.some((t) => !s.semesters!.includes(t.semester)))
    )
      ctx.addIssue({ code: "custom", message: "Invalid semester registry" });
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if (
      !s.managers.some((m) => m.role === "owner") ||
      !unique(s.managers.map((m) => m.id)) ||
      !unique(s.managers.map((m) => m.username.toLowerCase()))
    )
      ctx.addIssue({ code: "custom", message: "Invalid manager registry" });
    if (
      !unique(s.players.map((p) => p.id)) ||
      !unique(s.tournaments.map((t) => t.id))
    )
      ctx.addIssue({ code: "custom", message: "Duplicate IDs" });
    const ids = new Set(s.players.map((p) => p.id));
    for (const t of s.tournaments) {
      const entries = new Set(t.entries.map((e) => e.playerId));
      if (t.entries.some((e) => (e.joinedRound ?? 1) > t.roundsPlanned))
        ctx.addIssue({ code: "custom", message: "Invalid late-entry round" });
      if (
        entries.size !== t.entries.length ||
        t.entries.some((e) => !ids.has(e.playerId))
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid tournament participants",
        });
      if (
        t.rounds.length > t.roundsPlanned ||
        (t.status === "finished" &&
          (!t.finalizedAt || t.rounds.length !== t.roundsPlanned))
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid round/finalization state",
        });
      for (const r of t.rounds)
        if (
          r.games.some(
            (g) =>
              !entries.has(g.white) ||
              (g.black !== null && !entries.has(g.black)) ||
              (t.status === "finished" && !g.result),
          )
        )
          ctx.addIssue({ code: "custom", message: "Invalid game records" });
    }
    if (s.overrides.some((o) => !ids.has(o.playerId)))
      ctx.addIssue({
        code: "custom",
        message: "Unknown player in rating correction",
      });
  });
