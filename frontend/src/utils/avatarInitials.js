export function getAvatarInitials(user) {
  if (!user || typeof user !== 'object') return '?'

  const explicit = typeof user.avatarInitial === 'string'
    ? user.avatarInitial.trim()
    : ''
  if (explicit) return explicit.toUpperCase()

  const name = typeof user.name === 'string' ? user.name.trim() : ''
  return name ? name.slice(0, 2).toUpperCase() : '?'
}
