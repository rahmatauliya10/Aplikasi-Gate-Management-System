import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNotificationStore } from './notificationStore'
import api from '../services/api'

export const useTruckStore = defineStore('truck', () => {
    // State
    const trucks = ref([])
    const loading = ref(false)
    const error = ref(null)

    // Actions
    const fetchTrucks = async () => {
        loading.value = true
        try {
            // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
            const response = await api.get('/trucks')
            trucks.value = response.data
        } catch (err) {
            console.warn('API fetchTrucks failed, keeping existing mock trucks state', err)
        } finally {
            loading.value = false
        }
    }

    const addTruck = async (truck) => {
        loading.value = true
        try {
            // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
            const response = await api.post('/trucks', truck)
            trucks.value.push(response.data)
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('New Truck Registered', `Truck ${truck.licensePlate || 'New'} has been added to the system via API.`, 'success')
        } catch (err) {
            console.warn('API addTruck failed, using mock fallback', err)
            // Mock fallback
            trucks.value.push({
                id: Date.now(),
                ...truck,
                status: 'waiting',
                step: 'weighbridge_in',
                timestamps: {
                    entry: new Date().toISOString(),
                    weighbridge_in: null,
                    warehouse_start: null,
                    warehouse_end: null,
                    qc_start: null,
                    qc_end: null,
                    weighbridge_out: null,
                    gate_out: null,
                    exit: null
                },
                weights: {
                    gross: 0,
                    tare: 0,
                    net: 0,
                    rollWeight: 0
                }
            })
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('New Truck Registered', `Truck ${truck.licensePlate || 'New'} has been added to the system.`, 'success')
        } finally {
            loading.value = false
        }
    }

    const updateTruckStatus = async (id, status, step) => {
        loading.value = true
        try {
            // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
            await api.patch(`/trucks/${id}/status`, { status, step })
            // Success, update local state
            const truck = trucks.value.find(t => t.id === id)
            if (truck) {
                truck.status = status
                truck.step = step
            }
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Truck Status Updated', `Status updated via API to ${status} at ${step}.`, 'info')
        } catch (err) {
            console.warn('API updateTruckStatus failed, using mock fallback', err)
            // Mock fallback
            const truck = trucks.value.find(t => t.id === id)
            if (truck) {
                truck.status = status
                truck.step = step
                const now = new Date().toISOString()
                if (step === 'weighbridge_in') truck.timestamps.weighbridge_in = now
                if (step === 'gbb' || step === 'gbj' || step === 'gsp') truck.timestamps.warehouse_start = now
                if (status === 'processing' && (step === 'gbb' || step === 'gbj' || step === 'gsp')) truck.timestamps.warehouse_start = now
                if (status === 'waiting' && step === 'qc') truck.timestamps.warehouse_end = now
                if (status === 'processing' && step === 'qc') truck.timestamps.qc_start = now
                if (status === 'waiting' && step === 'weighbridge_out') truck.timestamps.qc_end = now
                if (status === 'completed' && step === 'qc') {
                    truck.timestamps.qc_end = now
                    truck.timestamps.exit = now
                }
                if (step === 'weighbridge_out') truck.timestamps.weighbridge_out = now
                if (step === 'gate_out') truck.timestamps.gate_out = now
                if (step === 'completed' && step !== 'qc') truck.timestamps.exit = now
                
                const notificationStore = useNotificationStore()
                notificationStore.addNotification('Truck Status Updated', `Truck ${truck.licensePlate || id} is now ${status} at ${step}.`, 'info')
            }
        } finally {
            loading.value = false
        }
    }

    const updateTruckWeight = async (id, type, weight) => {
        loading.value = true
        try {
            // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
            await api.patch(`/trucks/${id}/weighbridge`, { type, weight })
            const truck = trucks.value.find(t => t.id === id)
            if (truck) truck.weights[type] = weight
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Weight Recorded', `Weight recorded via API.`, 'info')
        } catch (err) {
            console.warn('API updateTruckWeight failed, using mock fallback', err)
            const truck = trucks.value.find(t => t.id === id)
            if (truck) {
                truck.weights[type] = weight
                const now = new Date().toISOString()
                if (truck.step === 'weighbridge_in') truck.timestamps.weighbridge_in = now
                if (truck.step === 'weighbridge_out') truck.timestamps.weighbridge_out = now
    
                if (truck.weights.gross && truck.weights.tare) {
                    truck.weights.net = Math.abs(truck.weights.gross - truck.weights.tare)
                }
                
                const notificationStore = useNotificationStore()
                notificationStore.addNotification('Weight Recorded', `${type} weight for truck ${truck.licensePlate || id} recorded as ${weight}kg.`, 'info')
            }
        } finally {
            loading.value = false
        }
    }

    const updateTruckDetails = async (id, details) => {
        loading.value = true
        try {
            // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
            // Can be dynamic based on process type, using /trucks/:id/qc as requested if it contains QC data
            await api.patch(`/trucks/${id}/details`, details)
            const truck = trucks.value.find(t => t.id === id)
            if (truck) Object.assign(truck, details)
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Truck Details Updated', `Details updated via API.`, 'info')
        } catch (err) {
            console.warn('API updateTruckDetails failed, using mock fallback', err)
            const truck = trucks.value.find(t => t.id === id)
            if (truck) {
                Object.assign(truck, details)
                const notificationStore = useNotificationStore()
                notificationStore.addNotification('Truck Details Updated', `Details for truck ${truck.licensePlate || id} have been updated.`, 'info')
            }
        } finally {
            loading.value = false
        }
    }

    // Getters
    const getTruckById = (id) => {
        return trucks.value.find(t => t.id === id)
    }

    const activeTrucks = computed(() => {
        return trucks.value.filter(t => t.status !== 'completed')
    })

    const completedTrucks = computed(() => {
        return trucks.value.filter(t => t.status === 'completed')
    })

    return {
        trucks,
        loading,
        error,
        fetchTrucks,
        addTruck,
        updateTruckStatus,
        updateTruckWeight,
        updateTruckDetails,
        getTruckById,
        activeTrucks,
        completedTrucks
    }
})
