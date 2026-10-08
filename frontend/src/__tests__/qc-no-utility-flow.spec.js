import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QCVerification from '../views/QCVerification.vue'
import CoalAnalysisForm from '../components/qc/CoalAnalysisForm.vue'
import ChemicalPacForm from '../components/qc/ChemicalPacForm.vue'
import ChemicalRapidKlenForm from '../components/qc/ChemicalRapidKlenForm.vue'
import { useAuthStore } from '../stores/authStore'
import { useTruckStore } from '../stores/truckStore'
import { useQcStore } from '../stores/qcStore'

vi.mock('../components/PageHeader.vue', () => ({
  default: { template: '<div class="page-header"><slot /></div>' },
}))
vi.mock('../components/StepTimeline.vue', () => ({
  default: { template: '<div class="step-timeline"></div>' },
}))
vi.mock('../components/TruckDetailsModal.vue', () => ({
  default: { template: '<div class="truck-details-modal"></div>' },
}))
vi.mock('../components/StatusBadge.vue', () => ({
  default: { template: '<span class="status-badge"><slot /></span>' },
}))
vi.mock('../components/Pagination.vue', () => ({
  default: { template: '<div class="pagination"></div>' },
}))
vi.mock('../components/ProcessTimerBadge.vue', () => ({
  default: { template: '<div class="process-timer-badge"></div>' },
}))
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

describe('QCVerification & PA Forms — Complete Removal of Utility from Active GSP Flow', () => {
  let pinia
  let authStore
  let truckStore
  let qcStore

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()
    truckStore = useTruckStore()
    qcStore = useQcStore()
    vi.clearAllMocks()
  })

  describe('QCVerification View — No Utility Action Buttons for Admin or QC', () => {
    const roles = ['QC', 'ADMIN']

    roles.forEach((role) => {
      it(`role ${role}: never renders #btn-open-utility-disposition for any GSP status`, async () => {
        authStore.user = { id: `usr-${role.toLowerCase()}`, role, name: `User ${role}` }
        const wrapper = mount(QCVerification)

        const testStatuses = [
          'QC_VEHICLE_PENDING',
          'QC_VEHICLE_IN_PROGRESS',
          'QC_RETEST_REQUIRED',
          'QC_VEHICLE_PASSED',
          'QC_VEHICLE_REJECTED',
          'WAITING_UTILITY_DISPOSITION',
        ]

        for (const status of testStatuses) {
          wrapper.vm.selectedTruck = {
            id: `tx-test-${status}`,
            plateNumber: 'B 1234 TEST',
            processType: 'GSP',
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            gspAnalysisProfile: 'COAL_PA',
            status,
            revision: 1,
          }
          await wrapper.vm.$nextTick()

          expect(wrapper.find('#btn-open-utility-disposition').exists()).toBe(false)
          expect(wrapper.text()).not.toContain('Disposisi Utility (Four-Eyes Principle)')
        }
      })
    })

    it('shows informative cards for QC_VEHICLE_PASSED and QC_VEHICLE_REJECTED, and legacy read-only for WAITING_UTILITY_DISPOSITION', async () => {
      authStore.user = { id: 'usr-qc', role: 'QC', name: 'QC Analyst' }
      const wrapper = mount(QCVerification)

      // QC_VEHICLE_PASSED
      wrapper.vm.selectedTruck = {
        id: 'tx-pass',
        plateNumber: 'B 1111 PAS',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: 'QC_VEHICLE_PASSED',
        revision: 1,
      }
      await wrapper.vm.$nextTick()
      const passedCard = wrapper.find('#card-qc-passed')
      expect(passedCard.exists()).toBe(true)
      expect(passedCard.text()).toContain('QC Selesai: Muatan Lolos (PASSED)')
      expect(passedCard.text()).toContain('siap untuk melanjutkan proses bongkar')

      // QC_VEHICLE_REJECTED
      wrapper.vm.selectedTruck = {
        id: 'tx-rej',
        plateNumber: 'B 2222 REJ',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: 'QC_VEHICLE_REJECTED',
        revision: 1,
      }
      await wrapper.vm.$nextTick()
      const rejectedCard = wrapper.find('#card-qc-rejected')
      expect(rejectedCard.exists()).toBe(true)
      expect(rejectedCard.text()).toContain('Muatan Ditolak (QC REJECTED)')
      expect(rejectedCard.text()).toContain('Proses dihentikan')

      // WAITING_UTILITY_DISPOSITION (legacy read-only)
      wrapper.vm.selectedTruck = {
        id: 'tx-legacy',
        plateNumber: 'B 3333 LEG',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: 'WAITING_UTILITY_DISPOSITION',
        revision: 1,
      }
      await wrapper.vm.$nextTick()
      const legacyCard = wrapper.find('#card-utility-legacy')
      expect(legacyCard.exists()).toBe(true)
      expect(legacyCard.text()).toContain('Status Historis: Menunggu Disposisi (Legacy)')
      expect(wrapper.find('#btn-open-utility-disposition').exists()).toBe(false)
    })

    it('QC_RETEST_REQUIRED only shows Retest button and no utility button', async () => {
      authStore.user = { id: 'usr-qc', role: 'QC', name: 'QC Analyst' }
      const wrapper = mount(QCVerification)

      wrapper.vm.selectedTruck = {
        id: 'tx-retest',
        plateNumber: 'B 4444 RET',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: 'QC_RETEST_REQUIRED',
        revision: 1,
      }
      await wrapper.vm.$nextTick()

      const retestBtn = wrapper.find('#btn-start-coal-retest')
      expect(retestBtn.exists()).toBe(true)
      expect(retestBtn.text()).toContain('Lakukan Uji Ulang PA Batubara (Round 2)')
      expect(wrapper.find('#btn-open-utility-disposition').exists()).toBe(false)
    })
  })

  describe('PA Forms — Absence of Utility Actions in All Forms', () => {
    it('CoalAnalysisForm: Round 1 OOS shows Retest; Round 2 OOS shows Reject; NO Utility button exists', async () => {
      // Round 1 OOS
      const wrapperRound1 = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-c1', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })
      await wrapperRound1.find('#input-coal-moisture').setValue(38.0)
      expect(wrapperRound1.find('#btn-coal-retest').exists()).toBe(true)
      expect(wrapperRound1.find('#btn-coal-utility-disp').exists()).toBe(false)
      expect(wrapperRound1.text()).not.toContain('Disposisi Utility')

      // Round 2 OOS
      const wrapperRound2 = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-c2', cargoSubType: 'Batubara' },
          testRound: 2,
        },
      })
      await wrapperRound2.find('#input-coal-moisture').setValue(38.0)
      expect(wrapperRound2.find('#btn-coal-reject').exists()).toBe(true)
      expect(wrapperRound2.find('#btn-coal-reject').text()).toContain('Muatan Ditolak (REJECT)')
      expect(wrapperRound2.find('#btn-coal-utility-disp').exists()).toBe(false)
      expect(wrapperRound2.text()).not.toContain('Disposisi Utility')
    })

    it('ChemicalPacForm: Operates under ACTIVE_CONFIGURED without governance banner and no Utility actions', () => {
      const wrapper = mount(ChemicalPacForm, {
        props: {
          transaction: { id: 'tx-pac', cargoSubType: 'PAC 280 AC' },
        },
      })
      const banner = wrapper.find('#banner-pac-governance')
      expect(banner.exists()).toBe(false)
      expect(wrapper.text()).not.toContain('PENDING_SIGNOFF')
      expect(wrapper.find('#btn-open-utility-disposition').exists()).toBe(false)
      expect(wrapper.find('#btn-utility-disposition').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Disposisi Utility')
      expect(wrapper.text()).not.toContain('Terima Bersyarat')
      expect(wrapper.text()).not.toContain('Sahkan Keputusan Disposisi')
    })

    it('ChemicalRapidKlenForm: Operates under ACTIVE_CONFIGURED without governance banner and no Utility actions', () => {
      const wrapper = mount(ChemicalRapidKlenForm, {
        props: {
          transaction: { id: 'tx-rk', cargoSubType: 'Rapid Klen' },
        },
      })
      const banner = wrapper.find('#banner-rapid-governance')
      expect(banner.exists()).toBe(false)
      expect(wrapper.text()).not.toContain('PENDING_SIGNOFF')
      expect(wrapper.find('#btn-open-utility-disposition').exists()).toBe(false)
      expect(wrapper.find('#btn-utility-disposition').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Disposisi Utility')
      expect(wrapper.text()).not.toContain('Terima Bersyarat')
      expect(wrapper.text()).not.toContain('Sahkan Keputusan Disposisi')
    })
  })
})
