import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import {
  fetchAuthenticatedBlob,
  releaseAuthenticatedBlob,
  clearAuthenticatedBlobCache,
  normalizeAndValidatePhotoUrl,
  useAuthenticatedPhoto,
} from '../composables/useAuthenticatedPhoto'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('Authenticated Photo Loading & Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthenticatedBlobCache()
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:8089/mock-uuid-1')
    window.URL.revokeObjectURL = vi.fn()
  })

  it('bypasses network for data: URLs and renders image directly', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const resolved = await fetchAuthenticatedBlob(dataUri)
    expect(resolved).toBe(dataUri)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('normalizes URL and strips redundant /api prefix for Axios compatibility', () => {
    const parsed1 = normalizeAndValidatePhotoUrl('/api/attachments/att-123/download')
    expect(parsed1.fetchUrl).toBe('/attachments/att-123/download')
    expect(parsed1.cacheKey).toBe('/api/attachments/att-123/download')

    const parsed2 = normalizeAndValidatePhotoUrl('/attachments/att-456/download')
    expect(parsed2.fetchUrl).toBe('/attachments/att-456/download')
  })

  it('blocks authenticated requests to external origins to protect credentials', async () => {
    const externalUrl = 'https://attacker.com/malicious-avatar.png'
    expect(() => normalizeAndValidatePhotoUrl(externalUrl)).toThrow(
      'Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.',
    )
    await expect(fetchAuthenticatedBlob(externalUrl)).rejects.toThrow(
      'Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.',
    )
    expect(api.get).not.toHaveBeenCalled()
  })

  it('fetches protected attachment endpoint via Axios with responseType blob', async () => {
    const mockBlob = new Blob(['mock-binary-data'], { type: 'image/png' })
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { 'content-type': 'image/png' },
    })

    const attachmentUrl = '/api/attachments/att-12345/download'
    const resolved = await fetchAuthenticatedBlob(attachmentUrl)

    expect(api.get).toHaveBeenCalledWith('/attachments/att-12345/download', {
      responseType: 'blob',
      timeout: 15000,
    })
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
    expect(resolved).toBe('blob:http://localhost:8089/mock-uuid-1')
  })

  it('deduplicates in-flight requests for identical URL concurrently', async () => {
    const mockBlob = new Blob(['shared-bytes'], { type: 'image/jpeg' })
    let resolvePromise
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    api.get.mockReturnValueOnce(pendingPromise)

    const url = '/api/attachments/att-concurrent/download'
    const fetch1 = fetchAuthenticatedBlob(url)
    const fetch2 = fetchAuthenticatedBlob(url)

    expect(api.get).toHaveBeenCalledTimes(1)

    resolvePromise({
      data: mockBlob,
      headers: { 'content-type': 'image/jpeg' },
    })

    const [res1, res2] = await Promise.all([fetch1, fetch2])
    expect(res1).toBe(res2)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('prevents race conditions during rapid photo switching', async () => {
    // Simulate Photo 1 takes 100ms, but Photo 2 is requested immediately and takes 10ms
    let resolvePhoto1
    let resolvePhoto2
    api.get.mockImplementation((url) => {
      if (url.includes('photo-1')) {
        return new Promise((resolve) => {
          resolvePhoto1 = resolve
        })
      }
      return new Promise((resolve) => {
        resolvePhoto2 = resolve
      })
    })

    const photo1Url = ref('/api/attachments/photo-1/download')
    const { resolvedUrl } = useAuthenticatedPhoto(photo1Url)

    // Switch to photo 2 before photo 1 resolves
    photo1Url.value = '/api/attachments/photo-2/download'
    await nextTick()

    // Resolve photo 2 first
    window.URL.createObjectURL = vi.fn().mockReturnValueOnce('blob:http://localhost:8089/photo-2')
    resolvePhoto2({
      data: new Blob(['photo2']),
      headers: { 'content-type': 'image/jpeg' },
    })

    await new Promise((r) => setTimeout(r, 20))
    expect(resolvedUrl.value).toBe('blob:http://localhost:8089/photo-2')

    // Now resolve photo 1 (stale)
    window.URL.createObjectURL = vi.fn().mockReturnValueOnce('blob:http://localhost:8089/photo-1')
    resolvePhoto1({
      data: new Blob(['photo1']),
      headers: { 'content-type': 'image/jpeg' },
    })

    await new Promise((r) => setTimeout(r, 20))
    // MUST still be photo-2! Stale photo-1 must NOT overwrite!
    expect(resolvedUrl.value).toBe('blob:http://localhost:8089/photo-2')
  })

  it('clears all cached Object URLs and revokes them upon logout', async () => {
    const mockBlob = new Blob(['cache-bytes'], { type: 'image/jpeg' })
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { 'content-type': 'image/jpeg' },
    })

    const createdUrl = 'blob:http://localhost:8089/logout-test'
    window.URL.createObjectURL = vi.fn().mockReturnValueOnce(createdUrl)

    await fetchAuthenticatedBlob('/api/attachments/logout-photo/download')
    expect(window.URL.createObjectURL).toHaveBeenCalled()

    clearAuthenticatedBlobCache()
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl)
  })

  it('renders AuthenticatedImage component and unmounts cleanly', async () => {
    const mockBlob = new Blob(['image-bytes'], { type: 'image/jpeg' })
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { 'content-type': 'image/jpeg' },
    })

    const wrapper = mount(AuthenticatedImage, {
      props: {
        src: '/api/attachments/att-67890/download',
        alt: 'Bukti Foto GSP',
        imgClass: 'test-img-class',
      },
    })

    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('alt')).toBe('Bukti Foto GSP')
    expect(img.classes()).toContain('test-img-class')

    wrapper.unmount()
  })

  it('renders graceful fallback error UI on 401 Unauthorized or 403 Forbidden without breaking page', async () => {
    api.get.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { message: 'Unauthorized: Sesi kedaluwarsa atau token tidak valid' },
      },
    })

    const wrapper = mount(AuthenticatedImage, {
      props: {
        src: '/api/attachments/att-unauthorized/download',
      },
    })

    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Foto Tidak Tersedia')
    expect(wrapper.find('.material-icons').text()).toBe('broken_image')
  })
})
