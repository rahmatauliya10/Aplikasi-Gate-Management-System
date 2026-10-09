import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GSPProcess from '../views/GSPProcess.vue'
import { useTruckStore } from '../stores/truckStore'
import { getStatusLabel } from '../utils/statusLabel'

// Mock subcomponents and composables that require router or network
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
vi.mock('../components/WeightInput.vue', () => ({
  default: {
    template: '<div class="weight-input" id="weight-input">{{ label }}</div>',
    props: ['label', 'isSubmitting']
  }
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
  useRouter: () => ({
    push: vi.fn()
  })
}))

describe('GSPProcess.vue — Start Button & Security Data Conditions', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('CONDITION 1: Renders Pre-Unloading Checklist when SJ and PO are already complete', async () => {
    const truckStore = useTruckStore()
    const truckComplete = {
      id: 'tx-gsp-001',
      transactionNumber: 'GMS-20260929-9001',
      plateNumber: 'B 1234 GSP',
      vendorName: 'PT Sparepart Jaya',
      processType: 'GSP',
      status: 'QC_VEHICLE_PASSED',
      suratJalanNumber: 'SJ-GSP-9999',
      poNumber: 'PO-GSP-8888',
      createdAt: '2026-09-29T08:00:00.000Z'
    }
    truckStore.trucks = [truckComplete]

    const wrapper = mount(GSPProcess, {
      global: {
        plugins: [pinia]
      }
    })

    // Select the truck from queue
    const truckCard = wrapper.find('.cursor-pointer')
    expect(truckCard.exists()).toBe(true)
    await truckCard.trigger('click')

    // Expect Pre-Unloading Checklist to be visible
    const checklistCard = wrapper.find('#card-preunload-checklist')
    expect(checklistCard.exists()).toBe(true)

    // Expect the missing security info form to NOT be displayed
    const securityForm = wrapper.find('#btn-save-security-gsp')
    expect(securityForm.exists()).toBe(false)
  })

  it('CONDITION 2: Renders completion form when Surat Jalan or PO is missing', async () => {
    const truckStore = useTruckStore()
    const truckMissingSj = {
      id: 'tx-gsp-002',
      transactionNumber: 'GMS-20260929-9002',
      plateNumber: 'B 5678 GSP',
      vendorName: 'PT Mandiri Sparepart',
      processType: 'GSP',
      status: 'QC_VEHICLE_PASSED',
      suratJalanNumber: null, // missing SJ
      poNumber: 'PO-GSP-7777',
      createdAt: '2026-09-29T08:15:00.000Z'
    }
    truckStore.trucks = [truckMissingSj]

    const wrapper = mount(GSPProcess, {
      global: {
        plugins: [pinia]
      }
    })

    // Select the truck from queue
    const truckCard = wrapper.find('.cursor-pointer')
    expect(truckCard.exists()).toBe(true)
    await truckCard.trigger('click')

    // Expect Pre-Unloading checklist to NOT be rendered until SJ and PO are complete
    expect(wrapper.find('#card-preunload-checklist').exists()).toBe(false)

    // Expect security completion form to be rendered
    const saveBtn = wrapper.find('#btn-save-security-gsp')
    expect(saveBtn.exists()).toBe(true)
    expect(saveBtn.text()).toContain('Siapkan Data & Lanjutkan Pemeriksaan')

    // SJ input is visible because SJ is missing
    const sjInput = wrapper.find('#input-gsp-surat-jalan')
    expect(sjInput.exists()).toBe(true)

    // PO input is NOT visible because PO is already present
    const poInput = wrapper.find('#input-gsp-po-number')
    expect(poInput.exists()).toBe(false)
  })

  it('CONDITION 3: Shows GSP receiving card when status is WAREHOUSE_IN_PROGRESS', async () => {
    const truckStore = useTruckStore()
    const truckInProgress = {
      id: 'tx-gsp-003',
      transactionNumber: 'GMS-20260929-9003',
      plateNumber: 'B 9999 GSP',
      vendorName: 'PT Sparepart Indo',
      processType: 'GSP',
      status: 'WAREHOUSE_IN_PROGRESS',
      receiptUnit: 'LITER',
      suratJalanNumber: 'SJ-OK-01',
      poNumber: 'PO-OK-01',
      createdAt: '2026-09-29T08:30:00.000Z'
    }
    truckStore.trucks = [truckInProgress]

    const wrapper = mount(GSPProcess, {
      global: {
        plugins: [pinia]
      }
    })

    const truckCard = wrapper.find('.cursor-pointer')
    await truckCard.trigger('click')

    // GSP Material Receiving card must be rendered
    const receivingCard = wrapper.find('#card-gsp-receiving')
    expect(receivingCard.exists()).toBe(true)
    expect(wrapper.find('#badge-receipt-unit').text()).toBe('LITER')
    expect(wrapper.find('#input-gsp-received-quantity').exists()).toBe(true)
  })

  it('No undeclared modal checklist artifacts remain in template', () => {
    const wrapper = mount(GSPProcess, {
      global: {
        plugins: [pinia]
      }
    })
    // Expect showChecklistModal and orphaned checklist elements to not exist
    expect(wrapper.vm.showChecklistModal).toBeUndefined()
    expect(wrapper.text()).not.toContain('Inspection Item')
    expect(wrapper.text()).not.toContain('Pass Inspection')
    expect(wrapper.text()).not.toContain('Reject Inspection')
  })
})

describe('Audit Trail Status Label Consistency for GSP vs GBJ', () => {
  it('formats initial QC status as QC SAMPLING for GSP process type', () => {
    expect(getStatusLabel('QC_VEHICLE_PENDING', 'GSP')).toBe('QC SAMPLING PENDING')
    expect(getStatusLabel('QC_VEHICLE_PASSED', 'GSP')).toBe('QC SAMPLING PASSED')
    expect(getStatusLabel('QC_VEHICLE_REJECTED', 'GSP')).toBe('QC SAMPLING REJECTED')
  })

  it('formats initial QC status as QC VEHICLE for GBJ process type', () => {
    expect(getStatusLabel('QC_VEHICLE_PENDING', 'GBJ')).toBe('QC VEHICLE PENDING')
    expect(getStatusLabel('QC_VEHICLE_PASSED', 'GBJ')).toBe('QC VEHICLE PASSED')
    expect(getStatusLabel('QC_VEHICLE_REJECTED', 'GBJ')).toBe('QC VEHICLE REJECTED')
  })
})
