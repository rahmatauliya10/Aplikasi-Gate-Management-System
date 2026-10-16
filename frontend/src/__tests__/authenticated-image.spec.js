import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import { fetchAuthenticatedBlob, releaseAuthenticatedBlob } from '../composables/useAuthenticatedPhoto'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('Authenticated Photo Loading & Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:8089/mock-uuid-1')
    window.URL.revokeObjectURL = vi.fn()
  })

  it('bypasses network for data: URLs and renders image directly', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const resolved = await fetchAuthenticatedBlob(dataUri)
    expect(resolved).toBe(dataUri)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('fetches protected /api/attachments/ endpoint via Axios with responseType blob', async () => {
    const mockBlob = new Blob(['mock-binary-data'], { type: 'image/png' })
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { 'content-type': 'image/png' },
    })

    const attachmentUrl = '/api/attachments/att-12345/download'
    const resolved = await fetchAuthenticatedBlob(attachmentUrl)

    expect(api.get).toHaveBeenCalledWith(attachmentUrl, {
      responseType: 'blob',
      timeout: 15000,
    })
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
    expect(resolved).toBe('blob:http://localhost:8089/mock-uuid-1')
  })

  it('renders AuthenticatedImage component and handles loading to loaded transition', async () => {
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

    // Wait for async photo load
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:http://localhost:8089/mock-uuid-1')
    expect(img.attributes('alt')).toBe('Bukti Foto GSP')
    expect(img.classes()).toContain('test-img-class')

    // Unmount triggers cleanup
    wrapper.unmount()
    releaseAuthenticatedBlob('/api/attachments/att-67890/download')
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
