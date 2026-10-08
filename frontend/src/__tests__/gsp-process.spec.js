import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GSPProcess from '../views/GSPProcess.vue'
import { useTruckStore } from '../stores/truckStore'
import { useWarehouseStore } from '../stores/warehouseStore'
import api from '../services/api'

vi.mock('../components/PageHeader.vue', () => ({
  default: { template: '<div class="page-header"><slot /></div>' }
}))
vi.mock('../components/StepTimeline.vue', () => ({
  default: { template: '<div class="step-timeline"></div>' }
}))
vi.mock('../components/TruckDetailsModal.vue', () => ({
  default: { template: '<div class="truck-details-modal"></div>' }
}))
vi.mock('../components/StatusBadge.vue', () => ({
  default: { template: '<span class="status-badge"><slot /></span>' }
}))
vi.mock('../components/Pagination.vue', () => ({
  default: { template: '<div class="pagination"></div>' }
}))

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn()
}
vi.mock('../composables/useToast', () => ({
  useToast: () => mockToast
}))

vi.mock('../composables/useConfirm', () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(true)
  })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  }
}))

describe('GSPProcess.vue — Canonical Pre-Unloading Checklist & Material-Specific Receiving', () => {
  let pinia
  let truckStore
  let warehouseStore

  const canonicalCodes = [
    'CLEAN_VEHICLE',
    'DOOR_SEAL_GOOD',
    'NO_EXPIRED_GAS_CYLINDER',
    'ITEMS_NEATLY_ARRANGED',
    'NO_PEST_OR_ANIMAL_TRACE',
    'GOOD_CLEAN_SEALED',
    'COA_MATCHES_BATCH',
    'QTY_TYPE_MATCHES_SJ',
    'VEHICLE_NO_LEAK_GOOD',
  ]

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    truckStore = useTruckStore()
    warehouseStore = useWarehouseStore()
    vi.clearAllMocks()
  })

  describe('Pre-Unloading Checklist (GSP-PREUNLOAD-2026.1)', () => {
    it('blocks bongkar and requires completing SJ/PO when missing', async () => {
      truckStore.trucks = [{
        id: 'tx-1',
        plateNumber: 'B 1111 GSP',
        processType: 'GSP',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: null, // missing SJ
        poNumber: 'PO-123',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      expect(wrapper.find('#btn-save-security-gsp').exists()).toBe(true)
      expect(wrapper.find('#card-preunload-checklist').exists()).toBe(false)
      expect(wrapper.find('#btn-start-unload').exists()).toBe(false)
    })

    it('renders exactly 9 canonical checklist items when SJ and PO are complete', async () => {
      truckStore.trucks = [{
        id: 'tx-2',
        plateNumber: 'B 2222 GSP',
        processType: 'GSP',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      expect(wrapper.find('#card-preunload-checklist').exists()).toBe(true)
      for (const code of canonicalCodes) {
        expect(wrapper.find(`#btn-chk-${code}-ok`).exists()).toBe(true)
        expect(wrapper.find(`#btn-chk-${code}-notok`).exists()).toBe(true)
      }
    })

    it('enables [ MULAI BONGKAR ] when all 9 items are OK and submits canonical preUnloadChecklist payload', async () => {
      truckStore.trucks = [{
        id: 'tx-3',
        plateNumber: 'B 3333 GSP',
        processType: 'GSP',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
      }]

      const startProcessSpy = vi.spyOn(warehouseStore, 'startProcess').mockResolvedValue({
        id: 'tx-3',
        status: 'WAREHOUSE_IN_PROGRESS',
      })

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      // Mark all 9 items as OK
      for (const code of canonicalCodes) {
        await wrapper.find(`#btn-chk-${code}-ok`).trigger('click')
      }

      const startBtn = wrapper.find('#btn-start-unload')
      expect(startBtn.exists()).toBe(true)
      expect(startBtn.attributes('disabled')).toBeUndefined()
      expect(wrapper.find('#btn-save-checklist-fail').exists()).toBe(false)

      await startBtn.trigger('click')

      expect(startProcessSpy).toHaveBeenCalledWith('tx-3', {
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
        preUnloadChecklist: {
          items: expect.arrayContaining([
            expect.objectContaining({ code: 'CLEAN_VEHICLE', result: 'OK' }),
            expect.objectContaining({ code: 'VEHICLE_NO_LEAK_GOOD', result: 'OK' }),
          ]),
        },
      })
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('9/9 OK'))
    })

    it('enables [ SIMPAN HASIL PEMERIKSAAN ] when any item is NOT_OK, blocking bongkar and recording audit truthfully', async () => {
      truckStore.trucks = [{
        id: 'tx-4',
        plateNumber: 'B 4444 GSP',
        processType: 'GSP',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
      }]

      const startProcessSpy = vi.spyOn(warehouseStore, 'startProcess').mockRejectedValue({
        response: {
          data: {
            message: 'GSP Pre-unloading checklist failed.',
            errors: ['PREUNLOAD_CHECKLIST_ITEMS_NOT_OK'],
          },
        },
      })

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      // Mark 8 items OK, and 1 item NOT_OK
      for (let i = 0; i < canonicalCodes.length; i++) {
        const code = canonicalCodes[i]
        if (code === 'DOOR_SEAL_GOOD') {
          await wrapper.find(`#btn-chk-${code}-notok`).trigger('click')
        } else {
          await wrapper.find(`#btn-chk-${code}-ok`).trigger('click')
        }
      }

      // [ MULAI BONGKAR ] must NOT exist
      expect(wrapper.find('#btn-start-unload').exists()).toBe(false)

      // [ SIMPAN HASIL PEMERIKSAAN ] must exist
      const saveFailBtn = wrapper.find('#btn-save-checklist-fail')
      expect(saveFailBtn.exists()).toBe(true)
      expect(saveFailBtn.attributes('disabled')).toBeUndefined()

      await saveFailBtn.trigger('click')

      expect(startProcessSpy).toHaveBeenCalledWith('tx-4', {
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
        preUnloadChecklist: {
          items: expect.arrayContaining([
            expect.objectContaining({ code: 'DOOR_SEAL_GOOD', result: 'NOT_OK' }),
          ]),
        },
      })
      expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('Hasil NOT_OK tercatat, bongkar ditahan'))
    })

    it('P0-02: does NOT claim NOT_OK is saved when API fails with server error or network failure', async () => {
      truckStore.trucks = [{
        id: 'tx-5-fail',
        plateNumber: 'B 5555 GSP',
        processType: 'GSP',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
      }]

      // API fails with generic 500 error (NOT PREUNLOAD_CHECKLIST_ITEMS_NOT_OK)
      vi.spyOn(warehouseStore, 'startProcess').mockRejectedValue(new Error('Network Error: 500 Internal Server Error'))

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      // Mark 1 item NOT_OK
      for (let i = 0; i < canonicalCodes.length; i++) {
        const code = canonicalCodes[i]
        if (code === 'NO_EXPIRED_GAS_CYLINDER') {
          await wrapper.find(`#btn-chk-${code}-notok`).trigger('click')
        } else {
          await wrapper.find(`#btn-chk-${code}-ok`).trigger('click')
        }
      }

      const saveFailBtn = wrapper.find('#btn-save-checklist-fail')
      await saveFailBtn.trigger('click')

      // Crucial: Must show error toast, NOT false success/warning claiming NOT_OK was recorded!
      expect(mockToast.warning).not.toHaveBeenCalled()
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Gagal mencatat audit checklist'))
    })
  })

  describe('P1-02 Cross-Layer Contract: GSPProcess.vue -> warehouseStore -> warehouseService -> API', () => {
    // Contract validator that simulates the exact backend StartWarehouseDto & WarehouseService verification
    const setupContractApiMock = () => {
      api.post.mockImplementation((url, payload) => {
        if (url.startsWith('/warehouse/start/')) {
          if (!payload.suratJalanNumber || !payload.poNumber) {
            return Promise.reject({
              response: { status: 400, data: { errors: ['MISSING_SURAT_JALAN_OR_PO'] } }
            })
          }
          if (!payload.preUnloadChecklist || !Array.isArray(payload.preUnloadChecklist.items)) {
            return Promise.reject({
              response: { status: 400, data: { errors: ['MISSING_PREUNLOAD_CHECKLIST'] } }
            })
          }
          const { items } = payload.preUnloadChecklist
          if (items.length !== 9) {
            return Promise.reject({
              response: { status: 400, data: { errors: ['GSP_PREUNLOAD_CHECKLIST_INVALID_LENGTH'] } }
            })
          }
          const codes = items.map(i => i.code)
          const allCanonical = canonicalCodes.every(c => codes.includes(c))
          if (!allCanonical || new Set(codes).size !== 9) {
            return Promise.reject({
              response: { status: 400, data: { errors: ['GSP_PREUNLOAD_CHECKLIST_INVALID_CODES'] } }
            })
          }
          const hasNotOk = items.some(i => i.result === 'NOT_OK')
          if (hasNotOk) {
            return Promise.reject({
              response: {
                status: 400,
                data: {
                  message: 'Pre-unload checklist items marked NOT_OK',
                  errors: ['PREUNLOAD_CHECKLIST_ITEMS_NOT_OK'],
                }
              }
            })
          }
          return Promise.resolve({
            data: {
              success: true,
              data: {
                id: 'tx-verified',
                status: 'WAREHOUSE_IN_PROGRESS',
              }
            }
          })
        }
        return Promise.resolve({ data: {} })
      })
    }

    it('Coal truck (QC_VEHICLE_PASSED + SJ/PO + 9/9 OK) starts warehouse successfully through real store & service layers', async () => {
      setupContractApiMock()
      truckStore.trucks = [{
        id: 'tx-coal-contract',
        plateNumber: 'B 1010 COAL',
        processType: 'GSP',
        cargoType: 'Batubara',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-COAL-1',
        poNumber: 'PO-COAL-1',
        receiptUnit: 'KG',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      for (const code of canonicalCodes) {
        await wrapper.find(`#btn-chk-${code}-ok`).trigger('click')
      }

      const startBtn = wrapper.find('#btn-start-unload')
      await startBtn.trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledWith('/warehouse/start/tx-coal-contract', {
        suratJalanNumber: 'SJ-COAL-1',
        poNumber: 'PO-COAL-1',
        preUnloadChecklist: {
          items: expect.arrayContaining([
            expect.objectContaining({ code: 'CLEAN_VEHICLE', result: 'OK' }),
            expect.objectContaining({ code: 'QTY_TYPE_MATCHES_SJ', result: 'OK' }),
          ])
        }
      })
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('9/9 OK'))
    })

    it('Solar truck (PA_NOT_REQUIRED + SJ/PO + 9/9 OK) starts warehouse successfully through real store & service layers', async () => {
      setupContractApiMock()
      truckStore.trucks = [{
        id: 'tx-solar-contract',
        plateNumber: 'B 2020 SOL',
        processType: 'GSP',
        cargoType: 'BBM',
        cargoSubType: 'Solar BBM',
        status: 'PA_NOT_REQUIRED',
        suratJalanNumber: 'SJ-SOLAR-1',
        poNumber: 'PO-SOLAR-1',
        receiptUnit: 'LITER',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      for (const code of canonicalCodes) {
        await wrapper.find(`#btn-chk-${code}-ok`).trigger('click')
      }

      const startBtn = wrapper.find('#btn-start-unload')
      await startBtn.trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledWith('/warehouse/start/tx-solar-contract', expect.objectContaining({
        suratJalanNumber: 'SJ-SOLAR-1',
        poNumber: 'PO-SOLAR-1',
      }))
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('9/9 OK'))
    })

    it('PAC / Rapid chemical truck (QC_VEHICLE_PASSED + SJ/PO + 9/9 OK) starts warehouse successfully through real layers', async () => {
      setupContractApiMock()
      truckStore.trucks = [{
        id: 'tx-pac-contract',
        plateNumber: 'B 3030 PAC',
        processType: 'GSP',
        cargoType: 'PAC 280 AC',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-PAC-1',
        poNumber: 'PO-PAC-1',
        receiptUnit: 'LITER',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      for (const code of canonicalCodes) {
        await wrapper.find(`#btn-chk-${code}-ok`).trigger('click')
      }

      const startBtn = wrapper.find('#btn-start-unload')
      await startBtn.trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledWith('/warehouse/start/tx-pac-contract', expect.objectContaining({
        suratJalanNumber: 'SJ-PAC-1',
        poNumber: 'PO-PAC-1',
      }))
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('9/9 OK'))
    })
  })

  describe('GSP Material-Specific Receiving (Decimal-Safe & UOM Invariant)', () => {
    it('fails closed when truck lacks receiptUnit', async () => {
      truckStore.trucks = [{
        id: 'tx-no-uom',
        plateNumber: 'B 5555 GSP',
        processType: 'GSP',
        status: 'WAREHOUSE_IN_PROGRESS',
        receiptUnit: null, // missing receiptUnit!
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      expect(wrapper.find('#alert-missing-receipt-unit').exists()).toBe(true)
      expect(wrapper.find('#input-gsp-received-quantity').exists()).toBe(false)
      expect(wrapper.find('#btn-complete-gsp-receiving').exists()).toBe(false)
    })

    it('renders read-only UOM badge (LITER for PAC/Solar/Rapid, KG for Coal) without frontend KG fallback', async () => {
      truckStore.trucks = [{
        id: 'tx-pac-receiving',
        plateNumber: 'B 6666 GSP',
        processType: 'GSP',
        status: 'WAREHOUSE_IN_PROGRESS',
        receiptUnit: 'LITER',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      const uomBadge = wrapper.find('#badge-receipt-unit')
      expect(uomBadge.exists()).toBe(true)
      expect(uomBadge.text()).toBe('LITER')
    })

    it('validates decimal string input: rejects scale > 3, negative, zero, commas, and exponents', async () => {
      truckStore.trucks = [{
        id: 'tx-receiving-val',
        plateNumber: 'B 7777 GSP',
        processType: 'GSP',
        status: 'WAREHOUSE_IN_PROGRESS',
        receiptUnit: 'LITER',
      }]

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      const qtyInput = wrapper.find('#input-gsp-received-quantity')
      const submitBtn = wrapper.find('#btn-complete-gsp-receiving')

      // Empty -> disabled
      expect(submitBtn.attributes('disabled')).toBeDefined()

      // Scale > 3 (4 decimals) -> invalid
      await qtyInput.setValue('8000.2507')
      expect(submitBtn.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Maksimal 3 angka di belakang koma')

      // Comma -> invalid
      await qtyInput.setValue('8,000.25')
      expect(submitBtn.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Gunakan titik (.)')

      // Exponent -> invalid
      await qtyInput.setValue('1e3')
      expect(submitBtn.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Notasi eksponensial')

      // Negative -> invalid
      await qtyInput.setValue('-50')
      expect(submitBtn.attributes('disabled')).toBeDefined()

      // Zero -> invalid
      await qtyInput.setValue('0')
      expect(submitBtn.attributes('disabled')).toBeDefined()

      // Valid: "8000.250"
      await qtyInput.setValue('8000.250')
      expect(submitBtn.attributes('disabled')).toBeUndefined()
    })

    it('submits exact string receivedQuantity and exact receivedUnit to completeProcess', async () => {
      truckStore.trucks = [{
        id: 'tx-receiving-submit',
        plateNumber: 'B 8888 GSP',
        processType: 'GSP',
        status: 'WAREHOUSE_IN_PROGRESS',
        receiptUnit: 'LITER',
      }]

      const completeSpy = vi.spyOn(warehouseStore, 'completeProcess').mockResolvedValue({
        id: 'tx-receiving-submit',
        status: 'WAREHOUSE_DONE',
      })

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      const qtyInput = wrapper.find('#input-gsp-received-quantity')
      await qtyInput.setValue('8000.250')

      const submitBtn = wrapper.find('#btn-complete-gsp-receiving')
      await submitBtn.trigger('click')

      expect(completeSpy).toHaveBeenCalledWith('tx-receiving-submit', {
        receivedQuantity: '8000.250',
        receivedUnit: 'LITER',
      })
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('8000.250 LITER'))
    })
  })
})
