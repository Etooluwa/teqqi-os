export type BusinessSearchInput = {
  industry: string;
  location: string;
  maxResults: number;
};

export type ProviderBusinessResult = {
  provider: "GOOGLE_PLACES";
  externalId: string;
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  providerStatus: string | null;
  resultPosition: number;
};

export type BusinessSearchProviderResponse = {
  query: string;
  provider: "GOOGLE_PLACES";
  requestedMaxResults: number;
  returnedResults: number;
  results: ProviderBusinessResult[];
};
