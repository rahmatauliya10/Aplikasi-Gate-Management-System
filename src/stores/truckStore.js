import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNotificationStore } from './notificationStore'

export const useTruckStore = defineStore('truck', () => {
    // State
    const trucks = ref([])
    const loading = ref(false)
    const error = ref(null)

    // Actions
    const addTruck = (truck) => {
        trucks.value.push({
            id: Date.now(),
            ...truck,
            status: 'waiting',
            step: 'weighbridge_in', // Now directly to weighbridge after registration
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
    }

    const updateTruckStatus = (id, status, step) => {
        const truck = trucks.value.find(t => t.id === id)
        if (truck) {
            truck.status = status
            truck.step = step
            // Update timestamp based on step
            const now = new Date().toISOString()
            if (step === 'weighbridge_in') truck.timestamps.weighbridge_in = now
            if (step === 'gbb' || step === 'gbj' || step === 'gsp') truck.timestamps.warehouse_start = now
            if (status === 'processing' && (step === 'gbb' || step === 'gbj' || step === 'gsp')) truck.timestamps.warehouse_start = now // Start of work
            if (status === 'waiting' && step === 'qc') truck.timestamps.warehouse_end = now // Finished warehouse, waiting for QC
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
    }

    const updateTruckWeight = (id, type, weight) => {
        const truck = trucks.value.find(t => t.id === id)
        if (truck) {
            truck.weights[type] = weight
            // Record timestamp for weighing activity
            const now = new Date().toISOString()
            if (truck.step === 'weighbridge_in') truck.timestamps.weighbridge_in = now
            if (truck.step === 'weighbridge_out') truck.timestamps.weighbridge_out = now

            if (truck.weights.gross && truck.weights.tare) {
                truck.weights.net = Math.abs(truck.weights.gross - truck.weights.tare)
            }
            
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Weight Recorded', `${type} weight for truck ${truck.licensePlate || id} recorded as ${weight}kg.`, 'info')
        }
    }

    const updateTruckDetails = (id, details) => {
        const truck = trucks.value.find(t => t.id === id)
        if (truck) {
            Object.assign(truck, details)
            
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Truck Details Updated', `Details for truck ${truck.licensePlate || id} have been updated.`, 'info')
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
        addTruck,
        updateTruckStatus,
        updateTruckWeight,
        updateTruckDetails,
        getTruckById,
        activeTrucks,
        completedTrucks
    }
})
