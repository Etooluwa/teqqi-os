import "server-only";

import { getSupabaseEnv } from "@/lib/env/server";

type SupabaseRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export async function supabaseRest<T>(
  path: string,
  options: SupabaseRequestOptions = {},
): Promise<T> {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const response = await fetch(`${supabaseUrl}/rest/v1${normalizedPath}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: supabaseSecretKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Supabase request failed (${response.status}): ${message || response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function checkSupabaseConnection(): Promise<boolean> {
  await supabaseRest<Array<{ id: string }>>("/businesses?select=id&limit=1");
  return true;
}
