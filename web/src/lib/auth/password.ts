// Shared by the set-password form and its API route. Keep it at or above the
// minimum configured in Supabase (Authentication → Policies), or the API rejects
// passwords the form accepted.
export const MIN_PASSWORD_LENGTH = 8;
