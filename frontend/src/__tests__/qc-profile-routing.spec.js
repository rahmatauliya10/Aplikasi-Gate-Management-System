import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QCVerification from '../views/QCVerification.vue'
import MasterDataModal from '../components/MasterDataModal.vue'
import { useTruckStore } from '../stores/truckStore'
import { useMasterDataStore } from '../stores/masterDataStore'
import { useAuthStore } from '../stores/authStore'

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
vi.mock('../components/ProcessTimerBadge.vue', () => ({
  default: { template: '<div class="process-timer-badge"></div>' }
}))
vi.mock('../components/qc/CoalAnalysisForm.vue', () => ({
  default: { name: 'CoalAnalysisForm', template: '<div id="coal-analysis-form">COAL FORM</div>' }
}))
vi.mock('../components/qc/ChemicalPacForm.vue', () => ({
  default: { name: 'ChemicalPacForm', template: '<div id="chemical-pac-form">PAC FORM</div>' }
}))
vi.mock('../components/qc/ChemicalRapidKlenForm.vue', () => ({
  default: { name: 'ChemicalRapidKlenForm', template: '<div id="chemical-rapid-klen-form">RAPID FORM</div>' }
}))
vi.mock('../components/qc/UtilityDispositionModal.vue', () => ({
  default: { template: '<div class="utility-modal"></div>' }
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
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}))

describe('QC Form Routing by Analysis Profile (Section 32 vectors 13-16, 18)', () => {
  let pinia
  let truckStore
  let masterStore
  let authStore

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    truckStore = useTruckStore()
    masterStore = useMasterDataStore()
    authStore = useAuthStore()
    authStore.user = { id: 'usr-qc-1', name: 'QC ANALYST', role: 'QC' }
    vi.clearAllMocks()
  })

  it('13. QC routes COAL_PA profile to CoalAnalysisForm', async () => {
    const wrapper = mount(QCVerification)
    const truckCoal = {
      id: 'tx-coal-1',
      plateNumber: 'B1234COAL',
      processType: 'GSP',
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
      gspAnalysisProfile: 'COAL_PA',
      status: 'QC_VEHICLE_PENDING',
      revision: 1
    }

    wrapper.vm.selectedTruck = truckCoal
    wrapper.vm.showGspPaModal = true
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'CoalAnalysisForm' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ChemicalPacForm' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChemicalRapidKlenForm' }).exists()).toBe(false)
  })

  it('14. QC routes PAC_PA profile to ChemicalPacForm', async () => {
    const wrapper = mount(QCVerification)
    const truckPac = {
      id: 'tx-pac-1',
      plateNumber: 'B1234PAC',
      processType: 'GSP',
      cargoType: 'Chemical UTL',
      cargoSubType: 'PAC 280 AC',
      gspAnalysisProfile: 'PAC_PA',
      status: 'QC_VEHICLE_PENDING',
      revision: 1
    }

    wrapper.vm.selectedTruck = truckPac
    wrapper.vm.showGspPaModal = true
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'ChemicalPacForm' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'CoalAnalysisForm' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChemicalRapidKlenForm' }).exists()).toBe(false)
  })

  it('15. QC routes RAPID_KLEN_PA profile to ChemicalRapidKlenForm', async () => {
    const wrapper = mount(QCVerification)
    const truckRapid = {
      id: 'tx-rpd-1',
      plateNumber: 'B1234RPD',
      processType: 'GSP',
      cargoType: 'Chemical PROD',
      cargoSubType: 'Rapid Klen',
      gspAnalysisProfile: 'RAPID_KLEN_PA',
      status: 'QC_VEHICLE_PENDING',
      revision: 1
    }

    wrapper.vm.selectedTruck = truckRapid
    wrapper.vm.showGspPaModal = true
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'ChemicalRapidKlenForm' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'CoalAnalysisForm' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChemicalPacForm' }).exists()).toBe(false)
  })

  it('16. PA_EXEMPT commodity is blocked from opening PA modal and renders no PA form', async () => {
    const wrapper = mount(QCVerification)
    const truckSolar = {
      id: 'tx-solar-1',
      plateNumber: 'B1234SOL',
      processType: 'GSP',
      cargoType: 'Fuel',
      cargoSubType: 'Solar',
      gspAnalysisProfile: 'PA_EXEMPT',
      status: 'PA_NOT_REQUIRED',
      revision: 1
    }

    // Attempt to open PA modal for PA_EXEMPT truck
    await wrapper.vm.openGspPaModal(truckSolar)
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('PA_EXEMPT')
    )
    expect(wrapper.vm.showGspPaModal).toBe(false)

    // Even if modal was forced open, exempt banner is shown in teleport and no PA form exists
    wrapper.vm.selectedTruck = truckSolar
    wrapper.vm.showGspPaModal = true
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'CoalAnalysisForm' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChemicalPacForm' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChemicalRapidKlenForm' }).exists()).toBe(false)
    expect(document.body.textContent).toContain('PA EXEMPT (Bebas Analisis PA Laboratorium)')
  })

  it('18. Product Master: Cannot activate missing-profile GSP product', async () => {
    const wrapper = mount(MasterDataModal, {
      props: { show: true }
    })
    wrapper.vm.selectedProcess = 'GSP'
    await wrapper.vm.$nextTick()

    // Open Add GSP product modal
    wrapper.vm.showAddGspModal = true
    await wrapper.vm.$nextTick()

    // Without selecting gspAnalysisProfile
    wrapper.vm.newGspForm.code = 'CHEM-XYZ'
    wrapper.vm.newGspForm.name = 'New Chemical XYZ'
    wrapper.vm.newGspForm.category = 'Chemical UTL'
    wrapper.vm.newGspForm.gspAnalysisProfile = null

    // Setting isActive=true while profile is null invalidates submission
    wrapper.vm.newGspForm.isActive = true
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.canSubmitGsp).toBe(false)
  })
})
