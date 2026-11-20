const siteOrigin = 'https://itu-chess-kulup.onrender.com';
const headers = {
  'Access-Control-Allow-Origin': siteOrigin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey',
  'Cache-Control': 'no-store',
};

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];

function pick(row: Row, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

export async function handleRequest(request: Request): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);

  const publicKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default;
  if (!publicKey || request.headers.get('apikey') !== publicKey) {
    return reply({ error: 'unauthorized' }, 401);
  }

  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
  const projectUrl = Deno.env.get('SUPABASE_URL');
  if (!projectUrl || !secret) return reply({ error: 'unavailable' }, 503);

  try {
    const url = new URL('/rest/v1/club_state', projectUrl);
    url.searchParams.set('id', 'eq.1');
    url.searchParams.set('select', 'players:state->players,tournaments:state->tournaments,reference:state->policy->reference');
    const response = await fetch(url, { headers: { apikey: secret }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return reply({ error: 'unavailable' }, 503);
    const [state] = await response.json();
    if (!state) return reply({ error: 'unavailable' }, 503);

    return reply({
      reference: state.reference ?? 1500,
      players: rows(state.players)
        .filter((player) => !player.archivedAt)
        .map((player) => pick(player, ['name', 'itu', 'official', 'officialType', 'games'])),
      tournaments: rows(state.tournaments).map((tournament) => {
        const names = new Map(rows(tournament.entries).map((entry) => [entry.playerId, entry.name]));
        return {
          ...pick(tournament, ['id', 'name', 'date', 'status', 'roundsPlanned', 'timeControl']),
          rounds: rows(tournament.rounds)
            .filter((round) => rows(round.games).length > 0 && rows(round.games).every((game) => game.result))
            .map((round) => ({
              number: round.number,
              games: rows(round.games).map((game) => ({
                board: game.board,
                white: names.get(game.white),
                black: names.get(game.black),
                result: game.result,
              })),
            })),
        };
      }),
    });
  } catch {
    return reply({ error: 'unavailable' }, 503);
  }
}

Deno.serve(handleRequest);
