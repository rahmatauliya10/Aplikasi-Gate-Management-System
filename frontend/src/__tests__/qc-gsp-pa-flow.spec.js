import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import QCVerification from '../views/QCVerification.vue';
import { useTruckStore } from '../stores/truckStore';
import { useQcStore } from '../stores/qcStore';
import qcService from '../services/qcService';
import api from '../services/api';

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
    name: 'CoalAnalysisForm',
    template: `
      <div class="coal-pa-form" data-testid="coal-analysis-form">
        <span class="test-round-display">Round {{ testRound }}</span>
        <button id="btn-mock-coal-submit" @click="$emit('submit', { productCategory: 'Coal', productName: 'Batubara', testRound, parameters: { visual: 'OK', moisture: 30.5 }, result: 'PASS', decision: 'RELEASE' })">
          Submit Coal PA
        </button>
      </div>
    `,
    props: ['transaction', 'testRound', 'isSubmitting'],
    emits: ['submit'],
  },
}));
vi.mock('../components/qc/ChemicalPacForm.vue', () => ({
  default: {
    name: 'ChemicalPacForm',
    template: `
      <div class="pac-pa-form" data-testid="pac-analysis-form">
        <button id="btn-mock-pac-submit" @click="$emit('submit', { productCategory: 'Chemicals', productName: 'PAC 280 AC', testRound: 1, parameters: { sensory: { visual: true, odor: true, packaging: true }, ph: 4.2, density: 1.20 }, result: 'PASS', decision: 'PENDING_DISPOSITION' })">
          Submit PAC PA
        </button>
      </div>
    `,
    props: ['transaction', 'isSubmitting'],
    emits: ['submit'],
  },
}));
vi.mock('../components/qc/ChemicalRapidKlenForm.vue', () => ({
  default: {
    name: 'ChemicalRapidKlenForm',
    template: '<div class="rapid-pa-form" data-testid="rapid-analysis-form"></div>',
    props: ['transaction', 'isSubmitting'],
    emits: ['submit'],
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

describe('QCVerification.vue — GSP PA Start Response Contract, State Preservation & Submit Flow', () => {
  let pinia;
  let truckStore;
  let qcStore;

  beforeEach(() => {
    document.body.innerHTML = '';
    pinia = createPinia();
    setActivePinia(pinia);
    truckStore = useTruckStore();
    qcStore = useQcStore();
    vi.clearAllMocks();

    vi.spyOn(truckStore, 'fetchTrucks').mockResolvedValue([]);
    vi.spyOn(qcService, 'getQueue').mockResolvedValue({ data: [] });

    // Spy on api.post for PA submission verification
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        message: 'Analisis PA laboratorium berhasil disimpan',
      },
    });
  });

  const triggerClick = async (el) => {
    if (el.trigger) {
      await el.trigger('click');
    } else {
      el.click();
    }
    await flushPromises();
  };

  it('Round 1: Batubara Start PA preserves ID/cargo, increments revision, renders CoalAnalysisForm, and submits with valid ID and updated revision', async () => {
    const coalTruck = {
      id: 'tx-coal-1',
      plateNumber: 'B 1234 COAL',
      driverName: 'Driver Coal',
      processType: 'GSP',
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
      status: 'QC_VEHICLE_PENDING',
      grossWeight: 25000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 1,
    };
    truckStore.trucks = [{ ...coalTruck }];

    // Mock exact authoritative backend response returned by startProductAnalysis
    vi.spyOn(qcService, 'startProductAnalysis').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Proses analisis laboratorium berhasil dimulai',
        data: {
          id: 'tx-coal-1',
          status: 'QC_VEHICLE_IN_PROGRESS',
          processType: 'GSP',
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          plateNumber: 'B 1234 COAL',
          driverName: 'Driver Coal',
          revision: 2,
          qcStartAt: '2026-10-05T08:00:00.000Z',
          grossWeight: 25000,
          weighInAt: '2026-10-05T07:55:00.000Z',
        },
      },
    });

    const wrapper = mount(QCVerification, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      attachTo: document.body,
    });
    await flushPromises();

    // 1. Select the truck card
    const card = wrapper.find('[data-testid="truck-card-tx-coal-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await flushPromises();

    // 2. Click "Analisis PA Laboratorium"
    const paBtn = wrapper.find('#btn-start-qc-action');
    expect(paBtn.exists()).toBe(true);
    await paBtn.trigger('click');
    await flushPromises();

    // 3. Assert canonical startProductAnalysis endpoint called with exact transaction ID
    expect(qcService.startProductAnalysis).toHaveBeenCalledWith('tx-coal-1');

    // 4. Assert selected truck in store preserves original ID, increments revision, and retains cargo fields
    const updatedStoreTruck = truckStore.getTruckById('tx-coal-1');
    expect(updatedStoreTruck).toBeDefined();
    expect(updatedStoreTruck.id).toBe('tx-coal-1');
    expect(updatedStoreTruck.status).toBe('QC_VEHICLE_IN_PROGRESS');
    expect(updatedStoreTruck.revision).toBe(2);
    expect(updatedStoreTruck.cargoType).toBe('Coal');
    expect(updatedStoreTruck.cargoSubType).toBe('Batubara');

    // 5. Assert CoalAnalysisForm is rendered, and unconfigured fallback text is NOT rendered
    const coalForm = wrapper.find('[data-testid="coal-analysis-form"]').exists()
      ? wrapper.find('[data-testid="coal-analysis-form"]')
      : document.body.querySelector('[data-testid="coal-analysis-form"]');
    expect(Boolean(coalForm)).toBe(true);

    const fullContent = (wrapper.text() + ' ' + (document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(fullContent).not.toContain('Formulir analisis untuk produk ini belum dikonfigurasi.');

    // 6. Submit Coal PA analysis from form
    const submitBtn = wrapper.find('#btn-mock-coal-submit').exists()
      ? wrapper.find('#btn-mock-coal-submit')
      : document.body.querySelector('#btn-mock-coal-submit');
    expect(Boolean(submitBtn)).toBe(true);
    await triggerClick(submitBtn);

    // 7. Assert outgoing POST goes to /qc/product-analysis/tx-coal-1 with authoritative revision 2
    expect(api.post).toHaveBeenCalledWith(
      '/qc/product-analysis/tx-coal-1',
      expect.objectContaining({
        productCategory: 'Coal',
        productName: 'Batubara',
        testRound: 1,
        revision: 2,
      }),
    );
  });

  it('Round 2 Retest: Batubara QC_RETEST_REQUIRED increments to revision 3, renders Round 2 form, and submits with updated revision', async () => {
    const retestTruck = {
      id: 'tx-coal-retest-2',
      plateNumber: 'B 5678 COAL',
      driverName: 'Driver Coal Retest',
      processType: 'GSP',
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
      status: 'QC_RETEST_REQUIRED',
      grossWeight: 25000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 2,
    };
    truckStore.trucks = [{ ...retestTruck }];

    // Server authoritative retest start response increments revision to 3
    vi.spyOn(qcService, 'startProductAnalysis').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Proses analisis laboratorium berhasil dimulai',
        data: {
          id: 'tx-coal-retest-2',
          status: 'QC_VEHICLE_IN_PROGRESS',
          processType: 'GSP',
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          plateNumber: 'B 5678 COAL',
          driverName: 'Driver Coal Retest',
          revision: 3,
          qcStartAt: '2026-10-05T08:15:00.000Z',
          grossWeight: 25000,
          weighInAt: '2026-10-05T07:55:00.000Z',
        },
      },
    });

    const wrapper = mount(QCVerification, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      attachTo: document.body,
    });
    await flushPromises();

    // Select the truck card
    const card = wrapper.find('[data-testid="truck-card-tx-coal-retest-2"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await flushPromises();

    // Click "Lakukan Uji Ulang PA Batubara (Round 2)" button
    const retestBtn = wrapper.find('#btn-start-coal-retest');
    expect(retestBtn.exists()).toBe(true);
    await retestBtn.trigger('click');
    await flushPromises();

    // Assert canonical startProductAnalysis called
    expect(qcService.startProductAnalysis).toHaveBeenCalledWith('tx-coal-retest-2');

    // Assert CoalAnalysisForm is rendered for Round 2
    const coalForm = wrapper.find('[data-testid="coal-analysis-form"]').exists()
      ? wrapper.find('[data-testid="coal-analysis-form"]')
      : document.body.querySelector('[data-testid="coal-analysis-form"]');
    expect(Boolean(coalForm)).toBe(true);

    const fullContent = (wrapper.text() + ' ' + (document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(fullContent).toContain('Round 2');
    expect(fullContent).not.toContain('Formulir analisis untuk produk ini belum dikonfigurasi.');

    // Submit Round 2
    const submitBtn = wrapper.find('#btn-mock-coal-submit').exists()
      ? wrapper.find('#btn-mock-coal-submit')
      : document.body.querySelector('#btn-mock-coal-submit');
    await triggerClick(submitBtn);

    // Outgoing POST must target the real ID with revision 3
    expect(api.post).toHaveBeenCalledWith(
      '/qc/product-analysis/tx-coal-retest-2',
      expect.objectContaining({
        testRound: 2,
        revision: 3,
      }),
    );
  });

  it('Chemical PAC: Start PA preserves PAC cargo identity, renders ChemicalPacForm, and submits to real transaction ID with updated revision', async () => {
    const pacTruck = {
      id: 'tx-pac-99',
      plateNumber: 'B 4321 PAC',
      driverName: 'Driver Chemical',
      processType: 'GSP',
      cargoType: 'Chemicals',
      cargoSubType: 'PAC 280 AC',
      status: 'QC_VEHICLE_PENDING',
      grossWeight: 16000,
      weighInAt: '2026-10-05T08:00:00.000Z',
      revision: 1,
    };
    truckStore.trucks = [{ ...pacTruck }];

    vi.spyOn(qcService, 'startProductAnalysis').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Proses analisis laboratorium berhasil dimulai',
        data: {
          id: 'tx-pac-99',
          status: 'QC_VEHICLE_IN_PROGRESS',
          processType: 'GSP',
          cargoType: 'Chemicals',
          cargoSubType: 'PAC 280 AC',
          plateNumber: 'B 4321 PAC',
          driverName: 'Driver Chemical',
          revision: 2,
          qcStartAt: '2026-10-05T08:05:00.000Z',
          grossWeight: 16000,
          weighInAt: '2026-10-05T08:00:00.000Z',
        },
      },
    });

    const wrapper = mount(QCVerification, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      attachTo: document.body,
    });
    await flushPromises();

    const card = wrapper.find('[data-testid="truck-card-tx-pac-99"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await flushPromises();

    const paBtn = wrapper.find('#btn-start-qc-action');
    expect(paBtn.exists()).toBe(true);
    await paBtn.trigger('click');
    await flushPromises();

    expect(qcService.startProductAnalysis).toHaveBeenCalledWith('tx-pac-99');

    // ChemicalPacForm must be rendered and fallback text absent
    const pacForm = wrapper.find('[data-testid="pac-analysis-form"]').exists()
      ? wrapper.find('[data-testid="pac-analysis-form"]')
      : document.body.querySelector('[data-testid="pac-analysis-form"]');
    expect(Boolean(pacForm)).toBe(true);

    const fullContent = (wrapper.text() + ' ' + (document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(fullContent).not.toContain('Formulir analisis untuk produk ini belum dikonfigurasi.');

    // Submit PAC form
    const submitBtn = wrapper.find('#btn-mock-pac-submit').exists()
      ? wrapper.find('#btn-mock-pac-submit')
      : document.body.querySelector('#btn-mock-pac-submit');
    await triggerClick(submitBtn);

    expect(api.post).toHaveBeenCalledWith(
      '/qc/product-analysis/tx-pac-99',
      expect.objectContaining({
        productCategory: 'Chemicals',
        productName: 'PAC 280 AC',
        revision: 2,
      }),
    );
  });

  it('Defensive Contract Verification: Handles sparse backend response gracefully by merging with existing truck state', async () => {
    const coalTruck = {
      id: 'tx-sparse-test',
      plateNumber: 'B 8888 SPAR',
      driverName: 'Driver Sparse',
      processType: 'GSP',
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
      status: 'QC_VEHICLE_PENDING',
      grossWeight: 20000,
      weighInAt: '2026-10-05T07:55:00.000Z',
      revision: 1,
    };
    truckStore.trucks = [{ ...coalTruck }];

    // Simulate edge case where backend returns only sparse fields (e.g. transactionId, status, revision)
    vi.spyOn(qcService, 'startProductAnalysis').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Proses analisis laboratorium berhasil dimulai',
        data: {
          transactionId: 'tx-sparse-test',
          status: 'QC_VEHICLE_IN_PROGRESS',
          revision: 2,
          qcStartAt: '2026-10-05T08:00:00.000Z',
        },
      },
    });

    const wrapper = mount(QCVerification, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      attachTo: document.body,
    });
    await flushPromises();

    const card = wrapper.find('[data-testid="truck-card-tx-sparse-test"]');
    await card.trigger('click');
    await flushPromises();

    const paBtn = wrapper.find('#btn-start-qc-action');
    await paBtn.trigger('click');
    await flushPromises();

    // Verify defensive merge prevented loss of cargo info or ID
    const coalForm = wrapper.find('[data-testid="coal-analysis-form"]').exists()
      ? wrapper.find('[data-testid="coal-analysis-form"]')
      : document.body.querySelector('[data-testid="coal-analysis-form"]');
    expect(Boolean(coalForm)).toBe(true);

    const fullContent = (wrapper.text() + ' ' + (document.body.textContent || '')).replace(/\s+/g, ' ');
    expect(fullContent).not.toContain('Formulir analisis untuk produk ini belum dikonfigurasi.');

    const submitBtn = wrapper.find('#btn-mock-coal-submit').exists()
      ? wrapper.find('#btn-mock-coal-submit')
      : document.body.querySelector('#btn-mock-coal-submit');
    await triggerClick(submitBtn);

    // Outgoing POST still has valid real transaction ID and updated revision
    expect(api.post).toHaveBeenCalledWith(
      '/qc/product-analysis/tx-sparse-test',
      expect.objectContaining({
        revision: 2,
      }),
    );
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

    vi.spyOn(qcService, 'startInspection').mockResolvedValueOnce({
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

    const wrapper = mount(QCVerification, {
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const card = wrapper.find('[data-testid="truck-card-tx-gbj-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await flushPromises();

    const qcActionBtn = wrapper.find('#btn-start-qc-action');
    expect(qcActionBtn.exists()).toBe(true);
    expect(qcActionBtn.text()).toContain('QC Vehicle Checklist (GBJ)');

    await qcActionBtn.trigger('click');
    await flushPromises();

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
    await flushPromises();

    const card = wrapper.find('[data-testid="truck-card-tx-solar-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');
    await flushPromises();

    const paBtn = wrapper.find('#btn-start-qc-action');
    expect(paBtn.exists()).toBe(true);

    await paBtn.trigger('click');
    await flushPromises();

    expect(qcService.startProductAnalysis).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('PA_NOT_REQUIRED'),
    );
  });
});
