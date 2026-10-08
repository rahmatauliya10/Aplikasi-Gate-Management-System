import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GSPProcess from '../views/GSPProcess.vue'
import { useTruckStore } from '../stores/truckStore'
import { useWarehouseStore } from '../stores/warehouseStore'

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

describe('GSPProcess.vue — Canonical Pre-Unloading Checklist & Material-Specific Receiving', () => {
  let pinia
  let truckStore
  let warehouseStore

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    truckStore = useTruckStore()
    warehouseStore = useWarehouseStore()
    vi.clearAllMocks()
  })

  describe('Pre-Unloading Checklist (GSP-PREUNLOAD-2026.1)', () => {
    const canonicalCodes = [
      'PHYSICAL_CONTAINER_SEAL',
      'DRIVER_PPE',
      'SAFETY_EQUIPMENT_READY',
      'HOSE_PIPE_CONDITION',
      'RECEIVING_TANK_CAPACITY',
      'VALVE_LINE_ALIGNMENT',
      'WHEEL_CHOCK_PLACEMENT',
      'SURAT_JALAN_PHYSICAL',
      'PURCHASE_ORDER_PHYSICAL',
    ]

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

    it('renders exactly 9 checklist items when SJ and PO are complete', async () => {
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

    it('enables [ MULAI BONGKAR ] when all 9 items are OK and submits checklist payload', async () => {
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
        checklist: expect.arrayContaining([
          expect.objectContaining({ code: 'PHYSICAL_CONTAINER_SEAL', result: 'OK' }),
          expect.objectContaining({ code: 'PURCHASE_ORDER_PHYSICAL', result: 'OK' }),
        ]),
      })
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('9/9 OK'))
    })

    it('enables [ SIMPAN HASIL PEMERIKSAAN ] when any item is NOT_OK, blocking bongkar', async () => {
      truckStore.trucks = [{
        id: 'tx-4',
        plateNumber: 'B 4444 GSP',
        processType: 'GSP',
        status: 'QC_VEHICLE_PASSED',
        suratJalanNumber: 'SJ-001',
        poNumber: 'PO-001',
      }]

      const startProcessSpy = vi.spyOn(warehouseStore, 'startProcess').mockRejectedValue({
        response: { data: { message: 'GSP Pre-unloading checklist failed.' } }
      })

      const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } })
      await wrapper.find('.cursor-pointer').trigger('click')

      // Mark 8 items OK, and 1 item NOT_OK
      for (let i = 0; i < canonicalCodes.length; i++) {
        const code = canonicalCodes[i]
        if (code === 'HOSE_PIPE_CONDITION') {
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
        checklist: expect.arrayContaining([
          expect.objectContaining({ code: 'HOSE_PIPE_CONDITION', result: 'NOT_OK' }),
        ]),
      })
      expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('NOT_OK tersimpan dan diaudit'))
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
