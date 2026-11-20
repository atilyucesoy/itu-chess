// The public Vite build uses a restricted read API. Editing and authentication
// always happen on the existing application origin.
export const publicSite = import.meta.env.MODE === "public-site"
  ? {
      endpoint: "https://prwyeokwsmxjryzdphho.supabase.co/rest/v1/club_publication?id=eq.1&select=revision,state",
      publishableKey: "sb_publishable_haghW2955DQY0a7hLTa5mQ_TwUEhey-",
      loginUrl: "https://itu-chess.onrender.com/#settings",
    }
  : null;
