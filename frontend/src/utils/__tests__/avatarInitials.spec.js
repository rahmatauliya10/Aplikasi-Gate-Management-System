import { describe, expect, it } from 'vitest'
import { getAvatarInitials } from '../avatarInitials'

describe('getAvatarInitials', () => {
  it('uses an explicit avatar initial when provided', () => {
    expect(getAvatarInitials({ avatarInitial: 'ad', name: 'Different Name' })).toBe('AD')
  })

  it('falls back to the first two characters of the user name', () => {
    expect(getAvatarInitials({ name: 'Admin User' })).toBe('AD')
  })

  it('trims names and returns a placeholder for missing names', () => {
    expect(getAvatarInitials({ name: '  security' })).toBe('SE')
    expect(getAvatarInitials({ name: '   ' })).toBe('?')
    expect(getAvatarInitials(null)).toBe('?')
  })
})
