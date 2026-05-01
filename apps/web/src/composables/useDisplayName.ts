export function displayName(user: { name?: string | null; email: string }): string {
  return user.name?.trim() || user.email
}
