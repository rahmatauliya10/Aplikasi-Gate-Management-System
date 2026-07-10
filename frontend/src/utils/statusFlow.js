export const requiresVehicleQc = (transaction) => {
  return transaction?.processType === 'GBJ' || transaction?.warehouseCode === 'GBJ';
};

export const requiresIncomingCheck = (transaction) => {
  const code = transaction?.processType || transaction?.warehouseCode;
  return code === 'GBB' || code === 'GSP';
};

export const getIncomingCheckLabel = (transaction) => {
  const code = transaction?.processType || transaction?.warehouseCode;
  if (code === 'GBB') return 'Analisa Incoming Kopi';
  if (code === 'GSP') return 'Incoming Material Check';
  return '';
};

export const canStartWarehouse = (status, transaction) => {
  const code = transaction?.processType || transaction?.warehouseCode;
  if (code === 'GBJ') {
    return status === 'QC_VEHICLE_PASSED';
  }
  return status === 'WEIGH_IN_DONE';
};

export const canStartIncomingCheck = (status, transaction) => {
  const code = transaction?.processType || transaction?.warehouseCode;
  if (code === 'GBB' || code === 'GSP') {
    return status === 'WAREHOUSE_DONE' || status === 'INCOMING_CHECK_PENDING' || status === 'INCOMING_CHECK_IN_PROGRESS' || status === 'WAREHOUSE_IN_PROGRESS';
  }
  return false;
};

export const canStartWeighOut = (status, transaction) => {
  const code = transaction?.processType || transaction?.warehouseCode;
  if (code === 'GBJ') {
    return status === 'WAREHOUSE_DONE' || status === 'QC_VEHICLE_REJECTED';
  }
  if (code === 'GBB' || code === 'GSP') {
    return status === 'INCOMING_CHECK_PASSED' || status === 'INCOMING_CHECK_REJECTED';
  }
  return false;
};

export const canStartGateCheckOut = (status, transaction) => {
  return status === 'WEIGH_OUT_DONE';
};
