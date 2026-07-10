export const WAREHOUSES = {
  GBB: "GBB",
  GBJ: "GBJ",
  GSP: "GSP",
};

export const WAREHOUSE_LABELS = {
  GBB: "Gudang Bahan Baku",
  GBJ: "Gudang Barang Jadi",
  GSP: "Gudang Sparepart",
};

export const WAREHOUSE_OPTIONS = [
  { code: "GBB", name: "Gudang Bahan Baku" },
  { code: "GBJ", name: "Gudang Barang Jadi" },
  { code: "GSP", name: "Gudang Sparepart" },
];

export const getFlowByWarehouse = (warehouseCode) => {
  if (warehouseCode === 'GBJ') {
    return [
      'Gate Check-In',
      'Weighbridge In',
      'QC Vehicle Check',
      'GBJ Process',
      'Weighbridge Out',
      'Gate Check-Out'
    ];
  } else if (warehouseCode === 'GBB') {
    return [
      'Gate Check-In',
      'Weighbridge In',
      'GBB Process',
      'Analisa Incoming Kopi',
      'Weighbridge Out',
      'Gate Check-Out'
    ];
  } else if (warehouseCode === 'GSP') {
    return [
      'Gate Check-In',
      'Weighbridge In',
      'GSP Process',
      'Incoming Material Check',
      'Weighbridge Out',
      'Gate Check-Out'
    ];
  }
  return [];
};
