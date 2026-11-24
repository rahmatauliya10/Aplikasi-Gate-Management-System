import { describe, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '../router'
import { resolveReminderLocation, navigateToReminder } from '../services/reminderNavigation'

const makeRouter = () => createRouter({ history: createMemoryHistory(), routes })

describe('reminder destination contract', () => {
  it.each([
    ['/gbj-process', 'gbj', '/gbj'], ['/gbb-process', 'gbb', '/gbb'],
    ['/gsp-process', 'gsp', '/gsp'], ['/qc-verification', 'qc', '/qc'],
    ['/dashboard', 'dashboard', '/'], ['/weighbridge', 'weighbridge', '/weighbridge'],
    ['/gate-out', 'gate-out', '/gate-out'], ['/gbj', 'gbj', '/gbj'],
  ])('resolves %s against the actual router', (targetRoute, name, path) => {
    const location = resolveReminderLocation({ targetRoute, transactionId: 'tx-1' })
    const resolved = makeRouter().resolve(location)
    expect(resolved.name).toBe(name)
    expect(resolved.path).toBe(path)
    expect(resolved.query.transactionId).toBe('tx-1')
  })

  it.each([
    { targetRoute: 'https://example.com', transactionId: 'tx' },
    { targetRoute: '/unknown', transactionId: 'tx' },
    { targetRouteName: 'unknown', targetRoute: '/gbj', transactionId: 'tx' },
    { targetRoute: '/gbj', transactionId: ['tx'] },
    { targetRoute: '/gbj', id: 'tx-QC-1' },
    { targetRoute: '/gbj', transactionId: '' },
  ])('rejects invalid payload %j', item => expect(resolveReminderLocation(item)).toBeNull())

  const setup = async () => {
    const router = makeRouter()
    await router.push('/')
    return {
      router, item: { id: 'rem-1', transactionId: 'tx-1', targetRoute: '/gbj-process' },
      user: { role: 'WAREHOUSE', warehouseAccess: ['GBJ'] },
      markAsRead: vi.fn(), onSuccess: vi.fn(), warn: vi.fn(),
    }
  }

  it('navigates before reading and accepts exact duplicate destinations', async () => {
    const args = await setup()
    args.markAsRead.mockImplementation(() => {
      expect(args.router.currentRoute.value.fullPath).toBe('/gbj?transactionId=tx-1')
    })
    expect(await navigateToReminder(args)).toBe(true)
    expect(args.markAsRead).toHaveBeenCalledWith('rem-1')
    expect(await navigateToReminder(args)).toBe(true)
    expect(args.onSuccess).toHaveBeenCalledTimes(2)
  })

  it.each([
    { role: 'QC', warehouseAccess: ['GBJ'] },
    { role: 'WAREHOUSE', warehouseAccess: ['GSP'] },
  ])('preserves access restrictions for %j', async user => {
    const args = await setup()
    expect(await navigateToReminder({ ...args, user })).toBe(false)
    expect(args.markAsRead).not.toHaveBeenCalled()
    expect(args.onSuccess).not.toHaveBeenCalled()
    expect(args.warn).toHaveBeenCalled()
  })

  it('does not read or close when a dirty-form guard aborts navigation', async () => {
    const args = await setup()
    args.router.beforeEach(() => false)
    expect(await navigateToReminder(args)).toBe(false)
    expect(args.markAsRead).not.toHaveBeenCalled()
    expect(args.onSuccess).not.toHaveBeenCalled()
  })

  it('does not count a session redirect as successful navigation', async () => {
    const args = await setup()
    args.router.beforeEach(to => to.name === 'login' ? true : { name: 'login' })
    expect(await navigateToReminder(args)).toBe(false)
    expect(args.markAsRead).not.toHaveBeenCalled()
    expect(args.warn).toHaveBeenCalled()
  })

  it('handles a rejected router promise', async () => {
    const args = await setup()
    vi.spyOn(args.router, 'push').mockRejectedValue(new Error('offline'))
    expect(await navigateToReminder(args)).toBe(false)
    expect(args.markAsRead).not.toHaveBeenCalled()
  })
})
