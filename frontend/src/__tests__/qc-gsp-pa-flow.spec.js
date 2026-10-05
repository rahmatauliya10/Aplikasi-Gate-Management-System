import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import QCVerification from '../views/QCVerification.vue';
import { useTruckStore } from '../stores/truckStore';
import { useQcStore } from '../stores/qcStore';
import qcService from '../services/qcService';

// Mock subcomponents
vi.mock('../components/PageHeader.vue', () => ({
  default: { template: '<div class="page-header"><slot /></div>' },
}));
vi.mock('../components/StepTimeline.vue', () => ({
  default: { template: '<div class="step-timeline"></div>' },
}));
vi.mock('../components/StatusBadge.vue', () => ({
  default: { template: '<span class="status-badge"><slot /></span>' },
}));
vi.mock('../components/ProcessTimerBadge.vue', () => ({
  default: { template: '<div class="timer-badge"></div>' },
}));
vi.mock('../components/Pagination.vue', () => ({
  default: { template: '<div class="pagination"></div>' },
}));
vi.mock('../components/TruckDetailsModal.vue', () => ({
  default: { template: '<div class="truck-details-modal"></div>' },
}));
vi.mock('../components/qc/CoalAnalysisForm.vue', () => ({
  default: {
    template: '<div class="coal-pa-form"></div>',
    props: ['transaction', 'testRound', 'isSubmitting'],
  },
}));
vi.mock('../components/qc/ChemicalPacForm.vue', () => ({
  default: {
    template: '<div class="pac-pa-form"></div>',
    props: ['transaction', 'isSubmitting'],
  },
}));
vi.mock('../components/qc/ChemicalRapidKlenForm.vue', () => ({
  default: {
    template: '<div class="rapid-pa-form"></div>',
    props: ['transaction', 'isSubmitting'],
  },
}));
vi.mock('../components/qc/UtilityDispositionModal.vue', () => ({
  default: {
    template: '<div class="utility-modal" v-if="show"></div>',
    props: ['show', 'isSubmitting'],
  },
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../composables/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../composables/useConfirm', () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

describe('QCVerification.vue — GSP PA Start Wiring Contract & Retest', () => {
  let pinia;
  let truckStore;
  let qcStore;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    truckStore = useTruckStore();
    qcStore = useQcStore();
    vi.clearAllMocks();

    vi.spyOn(truckStore, 'fetchTrucks').mockResolvedValue([]);

    vi.spyOn(qcService, 'startProductAnalysis').mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'tx-coal-1',
          status: 'QC_VEHICLE_IN_PROGRESS',
          qcStartAt: '2026-10-05T08:00:00.000Z',
          revision: 2,
        },
      },
    });

    vi.spyOn(qcService, 'startInspection').mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'tx-gbj-1',
          status: 'QC_VEHICLE_IN_PROGRESS',
          qcStartAt: '2026-10-05T08:00:00.000Z',
          revision: 2,
        },
      },
    });

    vi.spyOn(qcService, 'getQueue').mockResolvedValue({ data: [] });
  });

  it('GSP Batubara QC_VEHICLE_PENDING: Click PA button calls /api/qc/product-analysis/:id/start and MUST NOT call /qc/start/:id', async () => {
    const coalTruck = {
      id: 'tx-coal-1',
      plateNumber: 'B 1234 COAL',
      driverName: 'Driver Coal',
      processType: 'GSP',
      cargoType: 'Batu Bara',
      cargoSubType: 'Batu Bara',
      status: 'QC_VEHICLE_PENDING',
      grossWeight: 25000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 1,
    };
    truckStore.trucks = [coalTruck];

    const wrapper = mount(QCVerification, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    // Select the truck card
    const card = wrapper.find('[data-testid="truck-card-tx-coal-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await nextTick();

    // Click "Analisis PA Laboratorium" button
    const paBtn = wrapper.find('#btn-start-qc-action');
    expect(paBtn.exists()).toBe(true);
    expect(paBtn.text()).toContain('Analisis PA Laboratorium');

    await paBtn.trigger('click');
    await nextTick();

    // Assert dedicated endpoint was called
    expect(qcService.startProductAnalysis).toHaveBeenCalledWith('tx-coal-1');
    expect(qcService.startInspection).not.toHaveBeenCalled();
  });

  it('GSP Batubara QC_RETEST_REQUIRED: Click retest button calls canonical PA start and opens Round 2 form', async () => {
    const retestTruck = {
      id: 'tx-coal-retest',
      plateNumber: 'B 5678 COAL',
      driverName: 'Driver Coal 2',
      processType: 'GSP',
      cargoType: 'Batu Bara',
      cargoSubType: 'Batu Bara',
      status: 'QC_RETEST_REQUIRED',
      grossWeight: 25000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 2,
    };
    truckStore.trucks = [retestTruck];

    const wrapper = mount(QCVerification, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    // Select the truck card
    const card = wrapper.find('[data-testid="truck-card-tx-coal-retest"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await nextTick();

    // Click "Lakukan Uji Ulang PA Batubara (Round 2)" button
    const retestBtn = wrapper.find('#btn-start-coal-retest');
    expect(retestBtn.exists()).toBe(true);
    expect(retestBtn.text()).toContain('Lakukan Uji Ulang PA Batubara (Round 2)');

    await retestBtn.trigger('click');
    await nextTick();

    // Assert canonical start is called for retest round 2
    expect(qcService.startProductAnalysis).toHaveBeenCalledWith('tx-coal-retest');
    expect(qcService.startInspection).not.toHaveBeenCalled();
  });

  it('GBJ QC_VEHICLE_PENDING: Uses legacy startInspection and MUST NOT call startProductAnalysis', async () => {
    const gbjTruck = {
      id: 'tx-gbj-1',
      plateNumber: 'B 9999 GBJ',
      driverName: 'Driver GBJ',
      processType: 'GBJ',
      cargoType: 'Finished Goods',
      status: 'QC_VEHICLE_PENDING',
      tareWeight: 4000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 1,
    };
    truckStore.trucks = [gbjTruck];

    const wrapper = mount(QCVerification, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    const card = wrapper.find('[data-testid="truck-card-tx-gbj-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await nextTick();

    const qcActionBtn = wrapper.find('#btn-start-qc-action');
    expect(qcActionBtn.exists()).toBe(true);
    expect(qcActionBtn.text()).toContain('QC Vehicle Checklist (GBJ)');

    await qcActionBtn.trigger('click');
    await nextTick();

    expect(qcService.startInspection).toHaveBeenCalledWith('tx-gbj-1', expect.any(Object));
    expect(qcService.startProductAnalysis).not.toHaveBeenCalled();
  });

  it('Solar GSP: Does NOT trigger PA start and notifies user that Solar is PA_NOT_REQUIRED', async () => {
    const solarTruck = {
      id: 'tx-solar-1',
      plateNumber: 'B 1111 SOL',
      driverName: 'Driver Solar',
      processType: 'GSP',
      cargoType: 'Solar',
      cargoSubType: 'Solar',
      status: 'QC_VEHICLE_PENDING',
      grossWeight: 12000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 1,
    };
    truckStore.trucks = [solarTruck];

    const wrapper = mount(QCVerification, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    const card = wrapper.find('[data-testid="truck-card-tx-solar-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await nextTick();

    const paBtn = wrapper.find('#btn-start-qc-action');
    expect(paBtn.exists()).toBe(true);

    await paBtn.trigger('click');
    await nextTick();

    expect(qcService.startProductAnalysis).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('PA_NOT_REQUIRED'),
    );
  });
});
