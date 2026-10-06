import { defineStore } from 'pinia'
import api from '../services/api'
import { useToast } from '../composables/useToast'

export const useMasterDataStore = defineStore('masterData', {
  state: () => ({
    cargoSubTypeMap: {
      'Coffee Beans': ['Green Coffee Bean / Raw Coffee', 'Roasted Coffee Bean', 'Defect Coffee Bean', 'Rework Coffee Bean', 'Sample Coffee Bean', 'Other Coffee Bean'],
      'Fuel': ['Solar', 'Diesel Fuel'],
      'Chemicals': ['L AC-101', 'PRO-CIP B++', 'RAPID KLEEN', 'CAUSTIC SODA LIQUID 48%', 'PAC 280 AC', 'PAC 300', 'POLYCOR 0960', 'IPAC CIP A200'],
      'Instant Coffee': ['Finished Product', 'Return Product', 'Sample Product'],
      'Packaging Material': ['Carton', 'Pouch', 'Label', 'Plastic', 'Sack / Bag'],
      'Spare Parts': ['Mechanical Parts', 'Electrical Parts', 'Tools', 'Consumables'],
      'General Goods': ['Office Supplies', 'General Material', 'Other Goods'],
      'Waste / By-Product': ['Tumpi', 'Scrap', 'Reject Material', 'Waste Material']
    },
    vendors: [],
    loading: false,
    saving: false,
    gspProducts: [
      { id: 'cat-solar-1', code: 'SOLAR-001', name: 'Solar', category: 'Fuel', processType: 'GSP', gspAnalysisProfile: 'PA_EXEMPT', isPaRequired: false, policyVersion: 'SOP-GSP-2026.1', isActive: true },
      { id: 'cat-coal-1', code: 'COAL-001', name: 'Batubara', category: 'Coal', processType: 'GSP', gspAnalysisProfile: 'COAL_PA', isPaRequired: true, policyVersion: 'SOP-GSP-2026.1', isActive: true },
      { id: 'cat-pac-1', code: 'PAC-001', name: 'PAC 280 AC', category: 'Chemical UTL', processType: 'GSP', gspAnalysisProfile: 'PAC_PA', isPaRequired: true, policyVersion: 'SOP-GSP-2026.1', isActive: true },
      { id: 'cat-pac-2', code: 'PAC-002', name: 'POLYCOR P9', category: 'Chemical UTL', processType: 'GSP', gspAnalysisProfile: 'PAC_PA', isPaRequired: true, policyVersion: 'SOP-GSP-2026.1', isActive: true },
      { id: 'cat-pac-3', code: 'PAC-003', name: 'IPAC CIP A200', category: 'Chemical UTL', processType: 'GSP', gspAnalysisProfile: 'PAC_PA', isPaRequired: true, policyVersion: 'SOP-GSP-2026.1', isActive: true },
      { id: 'cat-rpd-1', code: 'RPD-001', name: 'Rapid Klen', category: 'Chemical PROD', processType: 'GSP', gspAnalysisProfile: 'RAPID_KLEN_PA', isPaRequired: true, policyVersion: 'SOP-GSP-2026.1', isActive: true },
      { id: 'cat-rpd-2', code: 'RPD-002', name: 'PRO-CIP B++', category: 'Chemical PROD', processType: 'GSP', gspAnalysisProfile: 'RAPID_KLEN_PA', isPaRequired: true, policyVersion: 'SOP-GSP-2026.1', isActive: true },
    ],
    loadingGsp: false,
    savingGsp: false
  }),

  actions: {
    async fetchAll() {
      this.loading = true
      try {
        const response = await api.get('/settings')
        
        const settings = response.data?.data || []
        
        const defaultCargoMap = {
          'Coffee Beans': ['Green Coffee Bean / Raw Coffee', 'Roasted Coffee Bean', 'Defect Coffee Bean', 'Rework Coffee Bean', 'Sample Coffee Bean', 'Other Coffee Bean'],
          'Fuel': ['Solar', 'Diesel Fuel'],
          'Chemicals': ['L AC-101', 'PRO-CIP B++', 'RAPID KLEEN', 'CAUSTIC SODA LIQUID 48%', 'PAC 280 AC', 'PAC 300', 'POLYCOR 0960', 'IPAC CIP A200'],
          'Instant Coffee': ['Finished Product', 'Return Product', 'Sample Product'],
          'Packaging Material': ['Carton', 'Pouch', 'Label', 'Plastic', 'Sack / Bag'],
          'Spare Parts': ['Mechanical Parts', 'Electrical Parts', 'Tools', 'Consumables'],
          'General Goods': ['Office Supplies', 'General Material', 'Other Goods'],
          'Waste / By-Product': ['Tumpi', 'Scrap', 'Reject Material', 'Waste Material']
        }
        
        const cargoSetting = settings.find(s => s.key === 'master_cargo_subtypes')
        const vendorSetting = settings.find(s => s.key === 'master_vendors')

        const parsedCargo = cargoSetting ? JSON.parse(cargoSetting.value) : null
        this.cargoSubTypeMap = (parsedCargo && Object.keys(parsedCargo).length > 0) ? parsedCargo : defaultCargoMap
        this.vendors = vendorSetting ? JSON.parse(vendorSetting.value) : []

      } catch (error) {
        console.error('Failed to fetch master data:', error)
      } finally {
        this.loading = false
      }

      await this.fetchGspProducts()
    },

    async fetchGspProducts() {
      this.loadingGsp = true
      try {
        const response = await api.get('/product-catalog', {
          params: { processType: 'GSP' }
        })
        if (Array.isArray(response.data) && response.data.length > 0) {
          this.gspProducts = response.data
        }
      } catch (error) {
        console.error('Failed to fetch GSP product catalog:', error)
      } finally {
        this.loadingGsp = false
      }
    },

    async createGspProduct(payload) {
      this.savingGsp = true
      const toast = useToast()
      try {
        const res = await api.post('/product-catalog', payload)
        toast.success(`Produk '${payload.name}' berhasil ditambahkan ke katalog GSP!`, 3500)
        await this.fetchGspProducts()
        return { success: true, data: res.data }
      } catch (error) {
        const msg = error.response?.data?.message || 'Gagal menambahkan produk katalog GSP'
        toast.error(msg, 4500)
        return { success: false, error: msg }
      } finally {
        this.savingGsp = false
      }
    },

    async updateGspProduct(id, payload) {
      this.savingGsp = true
      const toast = useToast()
      try {
        const res = await api.patch(`/product-catalog/${id}`, payload)
        toast.success('Katalog produk berhasil diperbarui!', 3500)
        await this.fetchGspProducts()
        return { success: true, data: res.data }
      } catch (error) {
        const msg = error.response?.data?.message || 'Gagal memperbarui katalog produk'
        toast.error(msg, 4500)
        return { success: false, error: msg }
      } finally {
        this.savingGsp = false
      }
    },

    async toggleGspProductActive(prod) {
      const toast = useToast()
      try {
        const nextStatus = !prod.isActive
        await api.patch(`/product-catalog/${prod.id}`, { isActive: nextStatus })
        toast.success(
          `Status produk '${prod.name}' diubah menjadi ${nextStatus ? 'AKTIF' : 'NONAKTIF'}.`,
          3500
        )
        await this.fetchGspProducts()
        return { success: true }
      } catch (error) {
        const msg = error.response?.data?.message || 'Gagal mengubah status aktif produk'
        toast.error(msg, 4500)
        return { success: false, error: msg }
      }
    },

    async deleteGspProduct(id) {
      const toast = useToast()
      try {
        const res = await api.delete(`/product-catalog/${id}`)
        toast.success(res.data?.message || 'Produk berhasil diproses', 3500)
        await this.fetchGspProducts()
        return { success: true }
      } catch (error) {
        const msg = error.response?.data?.message || 'Gagal menghapus produk'
        toast.error(msg, 4500)
        return { success: false, error: msg }
      }
    },

    async saveCargoSubTypes() {
      this.saving = true
      const toast = useToast()
      try {
        await api.post('/settings', {
          key: 'master_cargo_subtypes',
          value: JSON.stringify(this.cargoSubTypeMap)
        })
        toast.success('Cargo Types & Sub Types saved successfully!', 3500)
      } catch (error) {
        toast.error('Failed to save Cargo Types', 3500)
      } finally {
        this.saving = false
      }
    },

    async saveVendors() {
      this.saving = true
      const toast = useToast()
      try {
        await api.post('/settings', {
          key: 'master_vendors',
          value: JSON.stringify(this.vendors)
        })
        toast.success('Vendors saved successfully!', 3500)
      } catch (error) {
        toast.error('Failed to save Vendors', 3500)
      } finally {
        this.saving = false
      }
    }
  }
})
