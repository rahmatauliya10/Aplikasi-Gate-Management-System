import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GSPProcess from '../views/GSPProcess.vue'
import { useTruckStore } from '../stores/truckStore'
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
vi.mock('../composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  })
}))
vi.mock('../composables/useConfirm', () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(true)
  })
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({
    push: vi.fn()
  })
}))
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

describe('GSPProcess.vue — Chemical Quality Disposition Workflow', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  const mockHeldTruck = {
    id: 'tx-chem-held-01',
    transactionNumber: 'GMS-20261014-CHEM01',
    plateNumber: 'L 9999 PAC',
    driverName: 'Pak Budi',
    vendorName: 'PT Kimia Sejahtera',
    processType: 'GSP',
    cargoType: 'Chemical UTL',
    cargoSubType: 'PAC 280 AC',
    status: 'WAITING_GSP_DISPOSITION',
    testRound: 1,
    revision: 2,
    createdAt: '2026-10-14T08:00:00.000Z'
  }

  const mockPaDataCleanOos = {
    id: 'pa-clean-oos-1',
    isCurrent: true,
    isVoided: false,
    revision: 1,
    transactionId: 'tx-chem-held-01',
    productName: 'PAC 280 AC',
    productCategory: 'Chemical UTL',
    testRound: 1,
    parameters: {
      ph: 5.2, // OOS pH
      density: 1.20,
      sensory: {
        visual: 'Kuning',
        foreignMatters: 'Tidak ada kontaminasi',
        packagingLabel: 'Kemasan & label tidak rusak'
      }
    }
  }

  it('1. Includes WAITING_GSP_DISPOSITION (and legacy WAITING_UTILITY_DISPOSITION) trucks in GSP queue and renders disposition card', async () => {
    const truckStore = useTruckStore()
    truckStore.trucks = [mockHeldTruck]
    api.get.mockImplementation((url) => {
      if (url.includes('/qc/product-analysis/')) {
        return Promise.resolve({ data: { data: [mockPaDataCleanOos] } })
      }
      return Promise.resolve({ data: { data: [mockHeldTruck] } })
    })

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(mockHeldTruck)
    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#card-gsp-disposition').exists()).toBe(true)
    expect(wrapper.find('#btn-disposition-accept').exists()).toBe(true)
    expect(wrapper.find('#btn-disposition-retest').exists()).toBe(true)
    expect(wrapper.find('#btn-disposition-reject').exists()).toBe(true)
  })

  it('2. Accept with Note toggles inline form and enforces >= 5 characters reason', async () => {
    const truckStore = useTruckStore()
    truckStore.trucks = [mockHeldTruck]
    api.get.mockImplementation((url) => {
      if (url.includes('/qc/product-analysis/')) {
        return Promise.resolve({ data: { data: [mockPaDataCleanOos] } })
      }
      return Promise.resolve({ data: { data: [mockHeldTruck] } })
    })

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(mockHeldTruck)
    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    // Click Terima Catatan
    const acceptBtn = wrapper.find('#btn-disposition-accept')
    await acceptBtn.trigger('click')

    expect(wrapper.find('#input-disposition-note').exists()).toBe(true)
    const confirmBtn = wrapper.find('#btn-confirm-accept-note')
    expect(confirmBtn.attributes('disabled')).toBeDefined() // initially disabled (< 5 chars)

    // Type 3 chars -> still disabled
    await wrapper.find('#input-disposition-note').setValue('Acc')
    expect(wrapper.find('#btn-confirm-accept-note').attributes('disabled')).toBeDefined()

    // Type valid reason -> enabled
    await wrapper.find('#input-disposition-note').setValue('Disetujui deviasi pH oleh PIC GSP')
    expect(wrapper.find('#btn-confirm-accept-note').attributes('disabled')).toBeUndefined()

    // Submit
    api.post.mockResolvedValueOnce({ data: { success: true } })
    await wrapper.find('#btn-confirm-accept-note').trigger('click')

    expect(api.post).toHaveBeenCalledWith(
      '/qc/product-analysis/tx-chem-held-01/disposition',
      expect.objectContaining({
        action: 'ACCEPT_WITH_NOTE',
        reason: 'Disetujui deviasi pH oleh PIC GSP',
        revision: 2
      })
    )
  })

  it('3. Disables Accept with Note and renders warning if critical sensory defect exists', async () => {
    const mockContaminatedPa = {
      ...mockPaDataCleanOos,
      parameters: {
        ...mockPaDataCleanOos.parameters,
        sensory: {
          visual: 'Kuning',
          foreignMatters: 'Ditemukan serpihan logam', // CRITICAL CONTAMINATION
          packagingLabel: 'Kemasan & label tidak rusak'
        }
      }
    }

    const truckStore = useTruckStore()
    truckStore.trucks = [mockHeldTruck]
    api.get.mockImplementation((url) => {
      if (url.includes('/qc/product-analysis/')) {
        return Promise.resolve({ data: { data: [mockContaminatedPa] } })
      }
      return Promise.resolve({ data: { data: [mockHeldTruck] } })
    })

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(mockHeldTruck)
    await new Promise((r) => setTimeout(r, 20))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Penyimpangan Kritis Terdeteksi')
    const acceptBtn = wrapper.find('#btn-disposition-accept')
    expect(acceptBtn.attributes('disabled')).toBeDefined()
  })

  it('4. Disables Retest when active testRound >= 2 (max rounds reached)', async () => {
    const mockRound2Truck = {
      ...mockHeldTruck,
      testRound: 2
    }
    const mockRound2Pa = {
      ...mockPaDataCleanOos,
      testRound: 2
    }

    const truckStore = useTruckStore()
    truckStore.trucks = [mockRound2Truck]
    api.get.mockImplementation((url) => {
      if (url.includes('/qc/product-analysis/')) {
        return Promise.resolve({ data: { data: [mockRound2Pa] } })
      }
      return Promise.resolve({ data: { data: [mockRound2Truck] } })
    })

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(mockRound2Truck)
    await new Promise((r) => setTimeout(r, 20))
    await wrapper.vm.$nextTick()

    const retestBtn = wrapper.find('#btn-disposition-retest')
    expect(retestBtn.attributes('disabled')).toBeDefined()
  })

  it('5. Maintains backward compatibility for legacy WAITING_UTILITY_DISPOSITION trucks as read-only notice', async () => {
    const legacyTruck = {
      ...mockHeldTruck,
      status: 'WAITING_UTILITY_DISPOSITION',
    }

    const truckStore = useTruckStore()
    truckStore.trucks = [legacyTruck]
    api.get.mockImplementation((url) => {
      if (url.includes('/qc/product-analysis/')) {
        return Promise.resolve({ data: { data: [mockPaDataCleanOos] } })
      }
      return Promise.resolve({ data: { data: [legacyTruck] } })
    })

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(legacyTruck)
    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#card-utility-legacy').exists()).toBe(true)
    expect(wrapper.find('#card-gsp-disposition').exists()).toBe(false)
    expect(wrapper.find('#btn-disposition-accept').exists()).toBe(false)
  })

  it('6. Clicking Buka Pemeriksaan opens dedicated popup modal "Pemeriksaan Pra-Bongkar GSP"', async () => {
    const readyTruck = {
      ...mockHeldTruck,
      status: 'QC_VEHICLE_PASSED',
      suratJalanNumber: 'SJ-2026-001',
      poNumber: 'PO-2026-001',
    }
    const truckStore = useTruckStore()
    truckStore.trucks = [readyTruck]

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(readyTruck)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#card-preunload-checklist').exists()).toBe(true)
    expect(wrapper.find('#btn-open-checklist-modal').exists()).toBe(true)
    expect(wrapper.vm.showPreUnloadModal).toBe(false)

    // Click to open modal
    await wrapper.find('#btn-open-checklist-modal').trigger('click')
    expect(wrapper.vm.showPreUnloadModal).toBe(true)
    expect(wrapper.find('#modal-preunload-checklist').exists()).toBe(true)
    expect(wrapper.find('#modal-preunload-checklist').text()).toContain('Pemeriksaan Pra-Bongkar GSP')
  })

  it('7. If item is NOT OK, mandatory notes and photo proof fields appear in modal', async () => {
    const readyTruck = {
      ...mockHeldTruck,
      status: 'QC_VEHICLE_PASSED',
      suratJalanNumber: 'SJ-2026-001',
      poNumber: 'PO-2026-001',
    }
    const truckStore = useTruckStore()
    truckStore.trucks = [readyTruck]

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(readyTruck)
    await wrapper.vm.$nextTick()

    // Mark CLEAN_VEHICLE as NOT_OK
    await wrapper.find('#btn-chk-CLEAN_VEHICLE-notok').trigger('click')
    expect(wrapper.find('#input-note-CLEAN_VEHICLE').exists()).toBe(true)
    expect(wrapper.find('#btn-upload-photo-CLEAN_VEHICLE').exists()).toBe(true)
  })

  it('8. Renders WAITING_GSP_CHECKLIST_DISPOSITION queue card and opens decision modal', async () => {
    const waitingDecisionTruck = {
      ...mockHeldTruck,
      status: 'WAITING_GSP_CHECKLIST_DISPOSITION',
      suratJalanNumber: 'SJ-2026-001',
      poNumber: 'PO-2026-001',
      warehouseProcesses: [
        {
          id: 'wp-chk-1',
          checklistItems: {
            items: [{ code: 'CLEAN_VEHICLE', result: 'NOT_OK', notes: 'Bak kotor' }]
          }
        }
      ]
    }
    const truckStore = useTruckStore()
    truckStore.trucks = [waitingDecisionTruck]

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(waitingDecisionTruck)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#card-waiting-checklist-disposition').exists()).toBe(true)
    expect(wrapper.find('#btn-open-checklist-decision-modal').exists()).toBe(true)

    // Open decision modal
    await wrapper.find('#btn-open-checklist-decision-modal').trigger('click')
    expect(wrapper.vm.showChecklistDecisionModal).toBe(true)
    expect(wrapper.find('#modal-checklist-decision').exists()).toBe(true)
    expect(wrapper.find('#btn-decision-accept-note').exists()).toBe(true)
    expect(wrapper.find('#btn-decision-reject').exists()).toBe(true)
  })

  it('9. Checklist decision allows Terima dengan Catatan (konsesi) and submits via warehouseStore', async () => {
    const waitingDecisionTruck = {
      ...mockHeldTruck,
      status: 'WAITING_GSP_CHECKLIST_DISPOSITION',
      suratJalanNumber: 'SJ-2026-001',
      poNumber: 'PO-2026-001',
      revision: 3,
    }
    const truckStore = useTruckStore()
    truckStore.trucks = [waitingDecisionTruck]

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(waitingDecisionTruck)
    wrapper.vm.openChecklistDecisionModal()
    await wrapper.vm.$nextTick()

    // Select Terima dengan Catatan
    await wrapper.find('#btn-decision-accept-note').trigger('click')
    await wrapper.find('#input-checklist-decision-notes').setValue('Catatan justifikasi penerimaan PIC Gudang GSP')
    await wrapper.vm.$nextTick()

    api.post.mockResolvedValueOnce({ data: { success: true, data: { ...waitingDecisionTruck, status: 'WAREHOUSE_IN_PROGRESS' } } })
    await wrapper.find('#btn-confirm-checklist-decision').trigger('click')

    expect(api.post).toHaveBeenCalledWith(
      '/warehouse/tx-chem-held-01/checklist-disposition',
      expect.objectContaining({
        action: 'ACCEPT_WITH_NOTE',
        revision: 3,
      })
    )
  })

  it('10. Checklist decision allows Tolak Muatan and submits REJECT via warehouseStore', async () => {
    const waitingDecisionTruck = {
      ...mockHeldTruck,
      status: 'WAITING_GSP_CHECKLIST_DISPOSITION',
      suratJalanNumber: 'SJ-2026-001',
      poNumber: 'PO-2026-001',
      revision: 3,
    }
    const truckStore = useTruckStore()
    truckStore.trucks = [waitingDecisionTruck]

    const wrapper = mount(GSPProcess, {
      global: { plugins: [pinia] }
    })
    wrapper.vm.selectTruck(waitingDecisionTruck)
    wrapper.vm.openChecklistDecisionModal()
    await wrapper.vm.$nextTick()

    // Select Tolak Muatan
    await wrapper.find('#btn-decision-reject').trigger('click')
    await wrapper.find('#input-checklist-decision-notes').setValue('Catatan justifikasi penolakan PIC Gudang GSP')
    await wrapper.vm.$nextTick()

    api.post.mockResolvedValueOnce({ data: { success: true, data: { ...waitingDecisionTruck, status: 'QC_VEHICLE_REJECTED' } } })
    await wrapper.find('#btn-confirm-checklist-decision').trigger('click')

    expect(api.post).toHaveBeenCalledWith(
      '/warehouse/tx-chem-held-01/checklist-disposition',
      expect.objectContaining({
        action: 'REJECT',
        revision: 3,
      })
    )
  })
})
