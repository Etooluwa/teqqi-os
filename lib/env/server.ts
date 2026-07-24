import "server-only";

function requireServerEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseEnv() {
  return {
    supabaseUrl: requireServerEnv("SUPABASE_URL").replace(/\/$/, ""),
    supabaseSecretKey: requireServerEnv("SUPABASE_SECRET_KEY"),
  } as const;
}

export function getGooglePlacesEnv() {
  return {
    googlePlacesApiKey: requireServerEnv("GOOGLE_PLACES_API_KEY"),
  } as const;
}
