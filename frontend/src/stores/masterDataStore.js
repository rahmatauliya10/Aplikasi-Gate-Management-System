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
    saving: false
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
