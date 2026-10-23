import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TruckForm from '../components/TruckForm.vue'
import { useMasterDataStore } from '../stores/masterDataStore'
import { useAuthStore } from '../stores/authStore'

vi.mock('../composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} })
  }
}))

describe('TruckForm.vue — GSP Canonical Registration & Flow Lock', () => {
  let pinia
  let masterStore
  let authStore

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    masterStore = useMasterDataStore()
    authStore = useAuthStore()
    authStore.user = { id: 'usr-sec-1', name: 'SECURITY OFFICER', role: 'SECURITY' }
  })

  it('1. Select GSP: Cargo Type only shows Coal, Fuel, Chemical UTL, Chemical PROD', async () => {
    const wrapper = mount(TruckForm)
    // Step 1: select GSP
    const gspOption = wrapper.findAll('input[type="radio"]').find(r => r.element.value === 'GSP')
    await gspOption.setChecked()
    expect(wrapper.vm.form.processType).toBe('GSP')

    // Advance to Step 2
    wrapper.vm.currentStep = 2
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.cargoTypeOptions).toEqual([
      'Coal', 'Fuel', 'Chemical UTL', 'Chemical PROD'
    ])
  })

  it('2. Select Chemical UTL: shows PAC 280 AC, POLYCOR P9, IPAC CIP A200', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    wrapper.vm.currentStep = 2
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()

    const names = wrapper.vm.availableGspProducts.map(p => p.name)
    expect(names).toEqual(['PAC 280 AC', 'POLYCOR P9', 'IPAC CIP A200'])
  })

  it('3. Select Chemical PROD: shows Rapid Klen, PRO-CIP B++', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    wrapper.vm.currentStep = 2
    wrapper.vm.form.cargoType = 'Chemical PROD'
    await wrapper.vm.$nextTick()

    const names = wrapper.vm.availableGspProducts.map(p => p.name)
    expect(names).toEqual(['Rapid Klen', 'PRO-CIP B++'])
  })

  it('4. GSP: Add Sub Type button is NOT rendered / available', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    wrapper.vm.currentStep = 2
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    const addSubTypeBtn = buttons.find(b => b.text().includes('Add Sub Type'))
    expect(addSubTypeBtn).toBeUndefined()
  })

  it('5. GSP: Cannot select more than one material (single canonical selection)', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    wrapper.vm.currentStep = 2
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()

    // Pick PAC 280 AC
    wrapper.vm.onSelectGspProduct('cat-pac-1')
    expect(wrapper.vm.form.cargoSubTypes.length).toBe(1)
    expect(wrapper.vm.form.cargoSubTypes[0].name).toBe('PAC 280 AC')
    expect(wrapper.vm.form.productCatalogId).toBe('cat-pac-1')

    // Picking another product replaces it, does not append
    wrapper.vm.onSelectGspProduct('cat-pac-2')
    expect(wrapper.vm.form.cargoSubTypes.length).toBe(1)
    expect(wrapper.vm.form.cargoSubTypes[0].name).toBe('POLYCOR P9')
    expect(wrapper.vm.form.productCatalogId).toBe('cat-pac-2')
  })

  it('6. Switching GSP -> GBB clears GSP product, cargoType, and cargoSubTypes', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-pac-1')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.productCatalogId).toBe('cat-pac-1')
    expect(wrapper.vm.form.cargoType).toBe('Chemical UTL')

    // Switch to GBB
    wrapper.vm.form.processType = 'GBB'
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.cargoType).toBe('')
    expect(wrapper.vm.form.cargoSubTypes).toEqual([])
    expect(wrapper.vm.form.productCatalogId).toBeNull()
  })

  it('7. Switching GSP -> GBJ clears GSP product, cargoType, and cargoSubTypes', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cargoType = 'Coal'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-coal-1')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.productCatalogId).toBe('cat-coal-1')

    // Switch to GBJ
    wrapper.vm.form.processType = 'GBJ'
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.cargoType).toBe('')
    expect(wrapper.vm.form.cargoSubTypes).toEqual([])
    expect(wrapper.vm.form.productCatalogId).toBeNull()
  })

  it('8. Analysis Profile Previews: Batubara (COAL_PA), Solar (PA_EXEMPT), PAC (PAC_PA), Rapid (RAPID_KLEN_PA)', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    wrapper.vm.currentStep = 2
    await wrapper.vm.$nextTick()

    // Batubara
    wrapper.vm.form.cargoType = 'Coal'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-coal-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.selectedGspProduct?.gspAnalysisProfile).toBe('COAL_PA')

    // Solar
    wrapper.vm.form.cargoType = 'Fuel'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-solar-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.selectedGspProduct?.gspAnalysisProfile).toBe('PA_EXEMPT')

    // PAC 280 AC
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-pac-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.selectedGspProduct?.gspAnalysisProfile).toBe('PAC_PA')

    // Rapid Klen
    wrapper.vm.form.cargoType = 'Chemical PROD'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-rpd-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.selectedGspProduct?.gspAnalysisProfile).toBe('RAPID_KLEN_PA')
  })

  it('9. Registration payload contains productCatalogId when submitted', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    await wrapper.vm.$nextTick()
    wrapper.vm.form.vehicleType = 'TRONTON BOX'
    wrapper.vm.form.plateNumber = 'B9999XYZ'
    wrapper.vm.form.vendor = 'PT VENDOR GSP'
    wrapper.vm.form.driverName = 'JOKO'
    wrapper.vm.form.driverPhone = '08123456789'
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()
    wrapper.vm.onSelectGspProduct('cat-pac-1')
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cargoProcessType = 'INBOUND'
    wrapper.vm.form.permitCard = 'VMS-123'
    wrapper.vm.form.guestId = '3201234567890001'
    wrapper.vm.currentStep = 3

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.canSubmit).toBe(true)

    wrapper.vm.submitForm()
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeDefined()
    expect(emitted[0][0].productCatalogId).toBe('cat-pac-1')
    expect(emitted[0][0].processType).toBe('GSP')
    expect(emitted[0][0].cargoType).toBe('Chemical UTL')
    expect(emitted[0][0].cargoSubType).toBe('PAC 280 AC')
  })

  it('10. Non-GSP processes retain legacy "Add Sub Type" multi-subtype button', async () => {
    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GBB'
    wrapper.vm.currentStep = 2
    wrapper.vm.form.cargoType = 'Coffee Beans'
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    const addSubTypeBtn = buttons.find(b => b.text().includes('Add Sub Type'))
    expect(addSubTypeBtn).toBeDefined()
  })

  it('11. Inactive product is filtered out from available GSP products', async () => {
    // Add an inactive product to store
    masterStore.gspProducts.push({
      id: 'cat-inactive-1',
      code: 'INA-001',
      name: 'Inactive Chem',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: 'PAC_PA',
      isPaRequired: true,
      isActive: false
    })

    const wrapper = mount(TruckForm)
    wrapper.vm.form.processType = 'GSP'
    wrapper.vm.currentStep = 2
    wrapper.vm.form.cargoType = 'Chemical UTL'
    await wrapper.vm.$nextTick()

    const names = wrapper.vm.availableGspProducts.map(p => p.name)
    expect(names).not.toContain('Inactive Chem')
  })
})
