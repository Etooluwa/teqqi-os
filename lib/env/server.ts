import "server-only";

function requireServerEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function getServerEnv() {
  return {
    supabaseUrl: requireServerEnv("SUPABASE_URL").replace(/\/$/, ""),
    supabaseSecretKey: requireServerEnv("SUPABASE_SECRET_KEY"),
    googlePlacesApiKey: requireServerEnv("GOOGLE_PLACES_API_KEY"),
  } as const;
}
