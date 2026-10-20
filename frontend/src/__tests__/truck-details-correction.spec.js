import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import { GBJ_VEHICLE_CHECKLIST, GBJ_CHECKLIST_SEVERITY } from '../utils/gbjQcFlow'

const mocks = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' }, isAdmin: true },
  correct: vi.fn(), getById: vi.fn(), paHistory: vi.fn(), paPreview: vi.fn(),
}))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('../stores/truckStore', () => ({ useTruckStore: () => ({ correctOperationLogTruck: mocks.correct }) }))
vi.mock('../stores/settingsStore', () => ({ useSettingsStore: () => ({ weightTolerances: [] }) }))
vi.mock('../services/truckService', () => ({ default: { getById: mocks.getById, getAuditHistory: vi.fn().mockResolvedValue({ data: { timeline: [], data: [] } }) } }))
vi.mock('../services/qcService', () => ({ default: { getProductAnalysisHistory: mocks.paHistory, previewPaCorrection: mocks.paPreview } }))
vi.mock('../services/reopenPolicy', () => ({ evaluatePaExemption: () => ({ exempt: false }), getAllowedReopenTargets: () => [], getReopenMatrix: vi.fn().mockResolvedValue({}) }))
vi.mock('../utils/pdfGenerator', () => ({ printTruckReport: vi.fn() }))

const labels = [
  ['CLEAN_VEHICLE', 'Kendaraan bersih'], ['DOOR_SEAL_GOOD', 'Seal pintu kendaraan baik'],
  ['NO_EXPIRED_GAS_CYLINDER', 'Tidak ditemukan tabung gas yang sudah Exp date masa uji berlakunya'],
  ['ITEMS_NEATLY_ARRANGED', 'Barang tertata rapi'], ['NO_PEST_OR_ANIMAL_TRACE', 'Tidak ditemukan hama / binatang dan/atau jejak / bekas binatang'],
  ['GOOD_CLEAN_SEALED', 'Barang baik dan bersih serta tersegel'], ['COA_MATCHES_BATCH', 'CoA tersedia dan sesuai batchnya'],
  ['QTY_TYPE_MATCHES_SJ', 'Jumlah dan jenis barang sesuai SJ'], ['VEHICLE_NO_LEAK_GOOD', 'Kendaraan tidak bocor / kondisi baik'],
]
const fixture = (processType = 'GSP') => ({
  id: 'tx-1', transactionNumber: 'TX-TEST', revision: 4, status: 'COMPLETED', processType, plateNumber: 'B 1234 XYZ',
  productCatalog: { code: 'SOLAR-001', receiptUnit: 'LITER' },
  qcVehicleChecks: [], incomingMaterialChecks: [], attachments: [], weighbridgeRecords: [],
  warehouseProcesses: [{ id: 'wh-current', processType, isCurrent: true, revision: 2, actualQuantity: 12, unit: 'BAG', receivedQuantity: '123.000', receivedUnit: 'LITER',
    checklistItems: { version: 'GSP-PREUNLOAD-2026.1', overallResult: 'CONCESSION', disposition: { action: 'ACCEPT_WITH_NOTE', reason: 'Pengawasan khusus', decidedById: 'original' }, items: labels.map(([code, label]) => ({ code, label, result: ['CLEAN_VEHICLE', 'ITEMS_NEATLY_ARRANGED'].includes(code) ? 'NOT_OK' : 'OK', notes: 'Bukti asli', photoAttachmentId: 'photo-1' })) },
  }],
})
let wrapper
async function open(truck) {
  mocks.getById.mockResolvedValue({ data: truck })
  wrapper = mount(TruckDetailsModal, { props: { isOpen: true, truck }, global: { stubs: { teleport: true, StatusBadge: true, ProcessTimerBadge: true, AuthenticatedImage: true } } })
  await flushPromises()
  return wrapper.vm.$.setupState
}
async function submit(vm) {
  vm.correctionForm.reasonCategory = 'DATA_ENTRY_ERROR'
  vm.correctionForm.remark = 'Koreksi hasil pemeriksaan admin'
  await vm.submitCorrection()
  await flushPromises()
  expect(vm.correctionError).toBeNull()
}
beforeEach(() => { vi.clearAllMocks(); mocks.paHistory.mockResolvedValue({ data: [] }); mocks.auth.user.role = 'ADMIN'; mocks.auth.isAdmin = true; mocks.correct.mockResolvedValue({ updatedTx: { id: 'tx-1', revision: 5 } }) })
afterEach(() => wrapper?.unmount())

describe('Actual Admin operation correction modal', () => {
  it('submits PA to the effective current revision and refetches its history', async () => {
    const truck = fixture(); truck.productCatalog = { code: 'PAC', gspAnalysisProfile: 'PAC_PA' }; truck.gspAnalysisProfile = 'PAC_PA'
    const pa = { id: 'pa-current', testRound: 2, revision: 3, isCurrent: true, isVoided: false, analysisProfile: 'PAC_PA', parameters: { ph: 6, density: 1.2 } }
    mocks.paHistory.mockResolvedValue({ data: { data: [{ ...pa, id: 'pa-old', isCurrent: false }, pa] } })
    mocks.paPreview.mockResolvedValue({ data: { fingerprint: 'fp', result: 'PASS', status: 'RELEASE' } })
    const vm = await open(truck); await vm.openCorrectionModal(); await flushPromises()
    expect(vm.paCorrectionRecord.id).toBe('pa-current')
    vm.paCorrectionDirty = true
    await vm.previewPaCorrection({ targetRecordId: pa.id, expectedRevision: 4, expectedPaRevision: 3, parameters: { ph: 4.5 } })
    vm.setPaCorrectionItem({ targetModule: 'QC_PRODUCT_ANALYSIS', targetRecordId: pa.id, fieldName: 'parameters', newValue: { ph: 4.5 }, expectedRecordRevision: 3, evaluationFingerprint: 'fp', acknowledgeCurrentSpec: true })
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([expect.objectContaining({ targetModule: 'QC_PRODUCT_ANALYSIS', targetRecordId: 'pa-current', expectedRecordRevision: 3 })])
    expect(mocks.paHistory.mock.calls.length).toBeGreaterThan(1)
  })
  it('connects factual editor preview, acknowledgement and correction submission', async () => {
    const truck = fixture(); truck.productCatalog = { code: 'PAC', gspAnalysisProfile: 'PAC_PA' }; truck.gspAnalysisProfile = 'PAC_PA'
    const pa = { id: 'pa-current', testRound: 1, revision: 2, isCurrent: true, isVoided: false, analysisProfile: 'PAC_PA', parameters: { ph: 6, density: 1.2 } }
    mocks.paHistory.mockResolvedValue({ data: { data: [pa] } })
    mocks.paPreview.mockResolvedValue({ data: { fingerprint: 'fresh', result: 'PASS', status: 'RELEASE' } })
    const vm = await open(truck); await vm.openCorrectionModal(); await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('Hasil Analisa PA GSP')).trigger('click')
    await wrapper.get('#pa-correction-ph').setValue('4.5')
    await wrapper.findAll('button').find(b => b.text() === 'Preview evaluasi').trigger('click'); await flushPromises()
    expect(mocks.paPreview).toHaveBeenCalledWith('tx-1', { targetRecordId: pa.id, expectedRevision: 4, expectedPaRevision: 2, parameters: { ph: 4.5 } })
    await wrapper.get('#pa-correction-ack').setValue(true)
    await wrapper.findAll('button').find(b => b.text() === 'Gunakan koreksi PA').trigger('click')
    expect(vm.paCorrectionItem).toMatchObject({ evaluationFingerprint: 'fresh', newValue: { ph: 4.5 }, acknowledgeCurrentSpec: true })
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([expect.objectContaining({ targetRecordId: pa.id, expectedRecordRevision: 2, newValue: { ph: 4.5 } })])
  })
  it.each(['measurement', 'acknowledgement'])('invalidates accepted PA correction after changing %s in the mounted editor', async (change) => {
    const truck = fixture(); truck.productCatalog = { code: 'PAC', gspAnalysisProfile: 'PAC_PA' }; truck.gspAnalysisProfile = 'PAC_PA'
    const pa = { id: 'pa-current', testRound: 1, revision: 2, isCurrent: true, isVoided: false, analysisProfile: 'PAC_PA', parameters: { ph: 6, density: 1.2 } }
    mocks.paHistory.mockResolvedValue({ data: { data: [pa] } })
    mocks.paPreview.mockResolvedValue({ data: { fingerprint: 'fresh', result: 'PASS', status: 'RELEASE' } })
    const vm = await open(truck); await vm.openCorrectionModal(); await flushPromises()
    vm.activeCorrectionTab = 'QC_PA'; await wrapper.vm.$nextTick()
    await wrapper.get('#pa-correction-ph').setValue('4.5')
    await wrapper.findAll('button').find(b => b.text() === 'Preview evaluasi').trigger('click'); await flushPromises()
    await wrapper.get('#pa-correction-ack').setValue(true)
    await wrapper.findAll('button').find(b => b.text() === 'Gunakan koreksi PA').trigger('click')
    expect(vm.paCorrectionItem).not.toBeNull()
    if (change === 'measurement') await wrapper.get('#pa-correction-ph').setValue('4')
    else await wrapper.get('#pa-correction-ack').setValue(false)
    expect(vm.paCorrectionItem).toBeNull(); expect(vm.paCorrectionPreview).toBeNull()
    vm.correctionForm.reasonCategory = 'DATA_ENTRY_ERROR'; vm.correctionForm.remark = 'Koreksi hasil pengukuran PA'
    await vm.submitCorrection(); await flushPromises()
    expect(mocks.correct).not.toHaveBeenCalled()
  })
  it('blocks identity save when edited PA has no fresh accepted preview', async () => {
    const vm = await open(fixture()); await vm.openCorrectionModal()
    vm.paCorrectionDirty = true; vm.correctionForm.driverName = 'Changed driver'
    vm.correctionForm.reasonCategory = 'DATA_ENTRY_ERROR'; vm.correctionForm.remark = 'Koreksi hasil pengukuran PA'
    await vm.submitCorrection(); await flushPromises()
    expect(mocks.correct).not.toHaveBeenCalled()
    expect(vm.correctionError).toContain('Preview')
  })
  it('ignores asynchronous preview responses invalidated by a later edit', async () => {
    const vm = await open(fixture()); await vm.openCorrectionModal()
    let resolve; mocks.paPreview.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = vm.previewPaCorrection({ targetRecordId: 'pa-1' })
    vm.invalidatePaCorrectionPreview()
    resolve({ data: { fingerprint: 'stale' } }); await pending
    expect(vm.paCorrectionPreview).toBeNull()
    expect(vm.paCorrectionLoading).toBe(false)
  })
  it('submits GSP checklist to current warehouse without a QC Vehicle record', async () => {
    const truck = fixture(); const vm = await open(truck)
    await vm.openCorrectionModal()
    vm.correctionForm.gspPreUnloadResults[0] = true
    await submit(vm)
    expect(mocks.correct).toHaveBeenCalledTimes(1)
    const payload = mocks.correct.mock.calls[0][1]
    expect(payload.expectedRevision).toBe(4)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({ targetModule: 'WAREHOUSE', targetRecordId: 'wh-current', fieldName: 'checklistItems' })
    expect(payload.items[0].newValue.disposition).toEqual(truck.warehouseProcesses[0].checklistItems.disposition)
  })
  it('submits GBJ actualQuantity rather than actualWeight or kilograms', async () => {
    const vm = await open(fixture('GBJ')); await vm.openCorrectionModal()
    vm.correctionForm.actualQuantity = 15
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([{ targetModule: 'WAREHOUSE', targetRecordId: 'wh-current', fieldName: 'actualQuantity', newValue: 15 }])
  })
  it('renders ambiguous current QC records without crashing or choosing history', async () => {
    const truck = fixture('GBB'); truck.qcVehicleChecks = [{ id: 'one', isCurrent: true }, { id: 'two', isCurrent: true }]
    const vm = await open(truck); await vm.openCorrectionModal(); await flushPromises()
    expect(vm.gbjCorrectionRecord).toBeNull()
    expect(wrapper.text()).toContain('Koreksi')
    expect(vm.qcvOriginal.notes).toBeNull()
  })
  it('does not emit Incoming Material fields from GSP even when hidden values are changed', async () => {
    const truck = fixture(); truck.incomingMaterialChecks = [{ id: 'wrong-domain', isCurrent: true, moisture: 10 }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.imMoisture = 20
    vm.correctionForm.receivedQuantity = '124.000'
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([{ targetModule: 'WAREHOUSE', targetRecordId: 'wh-current', fieldName: 'receivedQuantity', newValue: '124.000' }])
  })
  it('submits a deliberate GBJ checklist, evidence and decision correction to its current QC record', async () => {
    const truck = fixture('GBJ')
    truck.qcVehicleChecks = [{ id: 'qc-current', isCurrent: true, decisionMode: 'NORMAL_PASS', result: 'PASS', hasDeviation: false, deviationReason: null, notes: null,
      checklistItems: { retained: 'metadata', items: GBJ_VEHICLE_CHECKLIST.map((label, index) => ({ label, ok: true, severity: GBJ_CHECKLIST_SEVERITY[index], photo: null })) } }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.gbjChecklist[2] = false
    vm.correctionForm.gbjPhotos[2] = 'data:image/png;base64,aW1hZ2U='
    vm.correctionForm.gbjDecisionMode = 'APPROVED_WITH_DEVIATION'
    vm.correctionForm.gbjDeviationReason = 'Pengawasan tambahan selama muat'
    await submit(vm)
    const items = mocks.correct.mock.calls[0][1].items
    expect(items.every(item => item.targetModule === 'QC_VEHICLE' && item.targetRecordId === 'qc-current')).toBe(true)
    expect(items.find(item => item.fieldName === 'hasDeviation').newValue).toBe(true)
    expect(items.find(item => item.fieldName === 'checklistItems').newValue.retained).toBe('metadata')
  })
  it('keeps identity-only GBB edits free of hidden sampling and Incoming Material changes', async () => {
    const truck = fixture('GBB')
    truck.qcVehicleChecks = [{ id: 'qc-current', isCurrent: true, notes: null, checklistItems: [{ label: 'Sampling Visual', ok: true }] }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.driverName = 'Driver corrected'
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([expect.objectContaining({ targetModule: 'TRANSACTION', fieldName: 'driverName', newValue: 'Driver corrected' })])
  })
  it('does not reconcile inconsistent GBB moisture metadata during identity-only correction', async () => {
    const truck = fixture('GBB')
    truck.qcVehicleChecks = [{ id: 'qc-current', isCurrent: true, checklistItems: { initialMoisture: 12, items: [{ label: 'Estimasi Moisture', value: 14 }] } }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.driverName = 'Driver corrected'
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([expect.objectContaining({ targetModule: 'TRANSACTION', fieldName: 'driverName' })])
  })
  it('submits deliberate GBB sampling result changes rather than silently ignoring them', async () => {
    const truck = fixture('GBB')
    truck.qcVehicleChecks = [{ id: 'qc-current', isCurrent: true, result: 'PASS', checklistItems: [{ label: 'Sampling Visual', ok: true }] }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.qcvResult = 'REJECTED'
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([{ targetModule: 'QC_VEHICLE', targetRecordId: 'qc-current', fieldName: 'result', newValue: 'REJECT' }])
  })
  it('sends a deliberate Incoming Material correction only to the current GBB record', async () => {
    const truck = fixture('GBB')
    truck.incomingMaterialChecks = [{ id: 'im-current', isCurrent: true, result: 'PASS', moisture: 12, notes: null }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.imMoisture = 13
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([{ targetModule: 'INCOMING_MATERIAL', targetRecordId: 'im-current', fieldName: 'moisture', newValue: 13 }])
  })
  it('distinguishes an explicit zero Incoming Material value from missing data', async () => {
    const truck = fixture('GBB')
    truck.incomingMaterialChecks = [{ id: 'im-current', isCurrent: true, moisture: null }]
    const vm = await open(truck); await vm.openCorrectionModal()
    vm.correctionForm.imMoisture = 0
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toEqual([{ targetModule: 'INCOMING_MATERIAL', targetRecordId: 'im-current', fieldName: 'moisture', newValue: 0 }])
  })
  it('keeps missing GBJ decision unknown and does not patch QC on identity-only changes', async () => {
    const truck = fixture('GBJ')
    truck.qcVehicleChecks = [{ id: 'qc-current', isCurrent: true, decisionMode: null, result: null, hasDeviation: null, notes: null,
      checklistItems: { items: GBJ_VEHICLE_CHECKLIST.map(label => ({ label, ok: true })) } }]
    const vm = await open(truck); await vm.openCorrectionModal()
    expect(vm.correctionForm.gbjDecisionMode).toBeNull()
    vm.correctionForm.driverName = 'Driver corrected'
    await submit(vm)
    expect(mocks.correct.mock.calls[0][1].items).toHaveLength(1)
    expect(mocks.correct.mock.calls[0][1].items[0].targetModule).toBe('TRANSACTION')
  })
  it('keeps missing weighbridge values unknown rather than displaying zero net and deviation', async () => {
    const vm = await open(fixture('GBB')); await vm.openCorrectionModal()
    expect(vm.correctionNetWeight).toBeNull()
    expect(vm.correctionDeviationKg).toBeNull()
    expect(vm.isCorrectionDeviationExceeded).toBe(false)
    vm.correctionForm.grossWeight = 1000
    vm.correctionForm.tareWeight = 200
    vm.correctionForm.actualWeight = 0
    expect(vm.correctionNetWeight).toBe(800)
    expect(vm.correctionDeviationKg).toBe(800)
    vm.correctionForm.tareWeight = 1200
    expect(vm.correctionNetWeight).toBeNull()
  })
  it('explains that GSP item edits cannot replace PA, disposition or evidence', async () => {
    const vm = await open(fixture()); await vm.openCorrectionModal()
    const tab = wrapper.findAll('button').find(button => button.text().includes('Pra-bongkar GSP'))
    expect(tab).toBeDefined()
    await tab.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Hanya hasil item')
    expect(wrapper.text()).toContain('bukti existing')
  })
  it('does not offer correction for nonterminal transactions', async () => {
    const truck = fixture(); truck.status = 'WAREHOUSE_IN_PROGRESS'
    await open(truck)
    expect(wrapper.findAll('button').some(button => button.text().includes('Koreksi Admin'))).toBe(false)
  })
  it('hides admin correction trigger from other roles', async () => {
    mocks.auth.user.role = 'QC'; mocks.auth.isAdmin = false
    await open(fixture())
    expect(wrapper.findAll('button').some(button => button.text().includes('Koreksi Admin'))).toBe(false)
  })
})
