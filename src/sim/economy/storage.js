(function initializeStorageLedger(namespace) {
  const FOUNDING_STORAGE_CAPACITY = 15000;
  const VILLAGE_WAREHOUSE_CAPACITY = 3000;
  const URBAN_WAREHOUSE_CAPACITY = 7500;
  const WAREHOUSE_CAPACITY = URBAN_WAREHOUSE_CAPACITY;

  function storageItem(id, label, category, coefficient, capacity = 'warehouse') {
    return Object.freeze({ id, label, category, coefficient, capacity });
  }

  const i = storageItem;
  const storageItems = Object.freeze([
    i('wood', 'Wood', 'construction-materials', 1.25),
    i('planks', 'Planks', 'construction-materials', 0.65),
    i('stone', 'Stone', 'construction-materials', 0.4),
    i('clay', 'Clay', 'construction-materials', 0.4),
    i('sand', 'Sand', 'construction-materials', 0.4),
    i('cut-stone', 'Cut Stone', 'construction-materials', 0.5),
    i('marble', 'Marble', 'construction-materials', 0.4),
    i('marble-blocks', 'Marble Blocks', 'construction-materials', 0.5),
    i('bricks', 'Bricks', 'construction-materials', 0.5),
    i('roof-tiles', 'Roof Tiles', 'construction-materials', 0.75),
    i('glass', 'Glass', 'construction-materials', 1),
    i('nails-fittings', 'Nails & Fittings', 'construction-materials', 0.15),
    i('copper', 'Copper', 'metals-industry', 0.4),
    i('tin', 'Tin', 'metals-industry', 0.4),
    i('iron', 'Iron', 'metals-industry', 0.4),
    i('coal', 'Coal', 'metals-industry', 0.75),
    i('gold', 'Gold', 'metals-industry', 0.15),
    i('silver', 'Silver', 'metals-industry', 0.15),
    i('sulfur', 'Sulfur', 'metals-industry', 0.4),
    i('diamonds', 'Diamonds', 'natural-trade', 0.05),
    i('pearls', 'Pearls', 'natural-trade', 0.05),
    i('bronze-ingots', 'Bronze Ingots', 'industrial-goods', 0.25),
    i('iron-ingots', 'Iron Ingots', 'industrial-goods', 0.25),
    i('steel-ingots', 'Steel Ingots', 'industrial-goods', 0.25),
    i('gold-ingots', 'Gold Ingots', 'industrial-goods', 0.1),
    i('silver-ingots', 'Silver Ingots', 'industrial-goods', 0.1),
    i('wheat', 'Wheat', 'food', 0.75),
    i('flour', 'Flour', 'food', 0.9),
    i('bread', 'Bread', 'food', 1),
    i('meat', 'Meat', 'food', 0.65),
    i('fish', 'Fish', 'food', 0.75),
    i('milk', 'Milk', 'food', 0.5),
    i('vegetables', 'Vegetables', 'food', 0.75),
    i('fruit', 'Fruit', 'food', 0.75),
    i('butter', 'Butter', 'food', 0.4),
    i('cheese', 'Cheese', 'food', 0.5),
    i('spiced-meat', 'Spiced Meat', 'food', 0.65),
    i('salt', 'Salt', 'natural-trade', 0.4),
    i('herbs', 'Herbs', 'natural-trade', 0.5),
    i('honey', 'Honey', 'natural-trade', 0.4),
    i('liquor', 'Liquor', 'natural-trade', 0.65),
    i('wine', 'Wine', 'natural-trade', 0.65),
    i('spiced-wine', 'Spiced Wine', 'natural-trade', 0.65),
    i('spices', 'Spices', 'natural-trade', 0.2),
    i('beeswax', 'Beeswax', 'natural-trade', 0.25),
    i('cotton', 'Cotton', 'raw-goods', 2),
    i('wool', 'Wool', 'raw-goods', 2),
    i('hides', 'Hides', 'raw-goods', 1.25),
    i('fur', 'Fur', 'raw-goods', 1.5),
    i('leather', 'Leather', 'industrial-goods', 0.75),
    i('cloth', 'Cloth', 'industrial-goods', 1),
    i('pottery', 'Pottery', 'industrial-goods', 1.25),
    i('glassware', 'Glassware', 'industrial-goods', 1.25),
    i('paper', 'Paper', 'industrial-goods', 0.25),
    i('books', 'Books', 'industrial-goods', 1),
    i('barrels', 'Barrels', 'industrial-goods', 4),
    i('candles', 'Candles', 'industrial-goods', 0.4),
    i('gunpowder', 'Gunpowder', 'industrial-goods', 0.4),
    i('simple-tools', 'Simple Tools', 'equipment', 0.75),
    i('bronze-tools', 'Bronze Tools', 'equipment', 0.5),
    i('iron-tools', 'Iron Tools', 'equipment', 0.5),
    i('steel-tools', 'Steel Tools', 'equipment', 0.5),
    i('horseshoes', 'Horseshoes', 'equipment', 0.25),
    i('simple-clothes', 'Simple Clothes', 'civilian-goods', 1.5),
    i('normal-clothes', 'Normal Clothes', 'civilian-goods', 1.5),
    i('luxury-clothes', 'Luxury Clothes', 'civilian-goods', 1.5),
    i('bandages', 'Bandages', 'civilian-goods', 0.5),
    i('treated-bandages', 'Treated Bandages', 'civilian-goods', 0.5),
    i('healing-salve', 'Healing Salve', 'civilian-goods', 0.25),
    i('herbal-medicine', 'Herbal Medicine', 'civilian-goods', 0.25),
    i('furniture', 'Furniture', 'civilian-goods', 25),
    i('luxury-furniture', 'Luxury Furniture', 'civilian-goods', 30),
    i('jewellery', 'Jewellery', 'civilian-goods', 0.05),
    i('military-rations', 'Military Rations', 'military-supplies', 0.4),
    i('wooden-shield', 'Wooden Shield', 'military-supplies', 0.75),
    i('leather-armour', 'Leather Armour', 'military-supplies', 2),
    i('bronze-armour', 'Bronze Armour', 'military-supplies', 1.5),
    i('iron-armour', 'Iron Armour', 'military-supplies', 1.5),
    i('steel-armour', 'Steel Armour', 'military-supplies', 1.5),
    i('bronze-sword', 'Bronze Sword', 'military-supplies', 0.2),
    i('iron-sword', 'Iron Sword', 'military-supplies', 0.2),
    i('steel-sword', 'Steel Sword', 'military-supplies', 0.2),
    i('bronze-spear', 'Bronze Spear', 'military-supplies', 0.5),
    i('iron-spear', 'Iron Spear', 'military-supplies', 0.5),
    i('steel-spear', 'Steel Spear', 'military-supplies', 0.5),
    i('bronze-bow', 'Bronze Bow', 'military-supplies', 0.75),
    i('iron-bow', 'Iron Bow', 'military-supplies', 0.75),
    i('steel-bow', 'Steel Bow', 'military-supplies', 0.75),
    i('bronze-hammer', 'Bronze Hammer', 'military-supplies', 0.5),
    i('iron-hammer', 'Iron Hammer', 'military-supplies', 0.5),
    i('steel-hammer', 'Steel Hammer', 'military-supplies', 0.5),
    i('saddle', 'Saddle', 'military-supplies', 1.5),
    i('horses', 'Horses', 'military-supplies', 0, 'stable'),
    i('warhorse', 'Warhorse', 'military-supplies', 0, 'stable'),
    i('ballista', 'Ballista', 'military-supplies', 0, 'army-order'),
    i('mangonel', 'Mangonel', 'military-supplies', 0, 'army-order'),
    i('cannon', 'Cannon', 'military-supplies', 0, 'army-order'),
    i('coins', 'Coins', 'civilian-goods', 0, 'treasury')
  ]);
  const storageItemById = Object.freeze(storageItems.reduce((result, item) => {
    result[item.id] = item;
    return result;
  }, {}));

  const founderReserve = Object.freeze({
    wood: 4000,
    planks: 1500,
    stone: 400,
    clay: 200,
    'nails-fittings': 2000,
    bread: 2790,
    meat: 1550,
    vegetables: 1240,
    fruit: 620,
    'simple-tools': 250,
    'simple-clothes': 100
  });

  function roundTo(value, digits = 4) {
    const scale = 10 ** digits;
    return Math.round((Number(value || 0) + Number.EPSILON) * scale) / scale;
  }

  function normalizeQuantities(values = {}) {
    const normalized = {};
    Object.entries(values).forEach(([resourceId, amount]) => {
      if (!storageItemById[resourceId]) {
        throw new Error(`Unknown storage item: ${resourceId}`);
      }
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 0) {
        throw new Error(`Invalid storage quantity for ${resourceId}.`);
      }
      if (numericAmount > 0) normalized[resourceId] = roundTo(numericAmount);
    });
    return normalized;
  }

  function addQuantities(target, values, multiplier = 1) {
    Object.entries(values).forEach(([resourceId, amount]) => {
      target[resourceId] = roundTo(Math.max(0, (target[resourceId] || 0) + amount * multiplier));
      if (target[resourceId] === 0) delete target[resourceId];
    });
  }

  function storagePointsFor(values = {}) {
    return roundTo(Object.entries(values).reduce((total, [resourceId, amount]) => {
      const item = storageItemById[resourceId];
      if (!item) throw new Error(`Unknown storage item: ${resourceId}`);
      return total + (Number(amount) || 0) * item.coefficient;
    }, 0), 2);
  }

  function quantityTotal(values = {}) {
    return roundTo(Object.values(values).reduce((total, amount) => total + (Number(amount) || 0), 0));
  }

  function eligibleReservationItems() {
    return storageItems.filter((item) => item.capacity === 'warehouse' && item.coefficient > 0);
  }

  function normalizeReservationMap(values = {}) {
    const normalized = {};
    Object.entries(values || {}).forEach(([resourceId, rawUnits]) => {
      const item = storageItemById[resourceId];
      const units = Number(rawUnits);
      if (!item || item.capacity !== 'warehouse' || item.coefficient <= 0) return;
      if (!Number.isFinite(units) || units < 0) return;
      if (units > 0) normalized[resourceId] = roundTo(units);
    });
    return normalized;
  }

  function ensureReservations(ledger) {
    ledger.storageReservations = normalizeReservationMap(ledger.storageReservations);
    ledger.pendingStorageReservations = ledger.pendingStorageReservations == null
      ? null
      : normalizeReservationMap(ledger.pendingStorageReservations);
    return ledger.storageReservations;
  }

  function reservationSummary(ledger, usePending = false) {
    ensureReservations(ledger);
    const reservations = usePending && ledger.pendingStorageReservations
      ? ledger.pendingStorageReservations
      : ledger.storageReservations;
    const totalReservedPoints = Object.entries(reservations).reduce((sum, [resourceId, units]) => (
      sum + units * storageItemById[resourceId].coefficient
    ), 0);
    const rows = Object.entries(reservations).map(([resourceId, reservedUnits]) => {
      const item = storageItemById[resourceId];
      const reservedPoints = reservedUnits * item.coefficient;
      const currentUnits = Math.max(0, Number(ledger.available[resourceId]) || 0)
        + Math.max(0, Number(ledger.reserved[resourceId]) || 0);
      const currentPoints = currentUnits * item.coefficient;
      const otherReservedPoints = Math.max(0, totalReservedPoints - reservedPoints);
      return {
        resourceId,
        label: item.label,
        reservedPoints: roundTo(reservedPoints, 2),
        reservedUnits: roundTo(reservedUnits),
        maxReservableUnits: roundTo(Math.max(0, ledger.capacity - otherReservedPoints) / item.coefficient),
        currentPoints: roundTo(currentPoints, 2),
        deficitPoints: roundTo(Math.max(0, reservedPoints - currentPoints), 2)
      };
    });
    return {
      reservations: { ...reservations },
      rows,
      totalReservedPoints: roundTo(totalReservedPoints, 2),
      generalPoints: roundTo(Math.max(0, ledger.capacity - totalReservedPoints), 2),
      totalPercent: ledger.capacity > 0 ? roundTo(totalReservedPoints / ledger.capacity * 100, 2) : 0,
      generalPercent: ledger.capacity > 0 ? roundTo(Math.max(0, ledger.capacity - totalReservedPoints) / ledger.capacity * 100, 2) : 100,
      pending: Boolean(usePending && ledger.pendingStorageReservations),
      overCapacity: storagePointsFor(ledger.available) + storagePointsFor(ledger.reserved) > ledger.capacity
    };
  }

  function requestReservation(ledger, resourceId, rawUnits) {
    ensureReservations(ledger);
    const item = storageItemById[resourceId];
    const units = Number(rawUnits);
    if (!item || item.capacity !== 'warehouse' || item.coefficient <= 0) {
      return { ok: false, reason: 'This product cannot use Warehouse reservations.' };
    }
    if (!Number.isFinite(units) || units < 0) {
      return { ok: false, reason: 'Reserve must be a non-negative product-unit amount.' };
    }
    const next = { ...(ledger.pendingStorageReservations || ledger.storageReservations) };
    if (units === 0) delete next[resourceId];
    else next[resourceId] = roundTo(units);
    const totalPoints = Object.entries(next).reduce((sum, [id, amount]) => (
      sum + amount * storageItemById[id].coefficient
    ), 0);
    if (totalPoints > ledger.capacity + 1e-9) {
      return { ok: false, reason: 'Product-unit reservations cannot exceed total Storage Capacity.', totalReservedPoints: roundTo(totalPoints, 2) };
    }
    ledger.pendingStorageReservations = next;
    return { ok: true, applies: 'next-daily-tick', preview: reservationSummary(ledger, true) };
  }

  function requestStockPolicy(ledger, resourceId, rawMin, rawMax, rawReserve, options = {}) {
    ensureProductCaps(ledger);
    ensureReservations(ledger);
    const previousCaps = ledger.pendingProductCaps == null ? null : { ...ledger.pendingProductCaps };
    const previousReservations = ledger.pendingStorageReservations == null ? null : { ...ledger.pendingStorageReservations };
    const capResult = requestProductCap(ledger, resourceId, rawMin, rawMax, options);
    if (!capResult.ok) return capResult;
    const reservationResult = requestReservation(ledger, resourceId, rawReserve);
    if (!reservationResult.ok) {
      ledger.pendingProductCaps = previousCaps;
      ledger.pendingStorageReservations = previousReservations;
      return reservationResult;
    }
    return { ok: true, applies: 'next-daily-tick', cap: capResult.pending, reservation: reservationResult.preview };
  }
  function applyPendingReservations(ledger) {
    ensureReservations(ledger);
    if (!ledger.pendingStorageReservations) return { applied: false, summary: reservationSummary(ledger) };
    ledger.storageReservations = { ...ledger.pendingStorageReservations };
    ledger.pendingStorageReservations = null;
    return { applied: true, summary: reservationSummary(ledger) };
  }
  function normalizeProductCap(rawCap = {}) {
    const rawMax = rawCap.max;
    const max = rawMax == null || rawMax === '' ? null : Number(rawMax);
    let min = Math.max(0, Number(rawCap.min) || 0);
    const autoMin = max != null && rawCap.autoMin !== false && (Boolean(rawCap.autoMin) || min <= 0);
    if (autoMin) min = max * 0.8;
    if (max != null && (!Number.isFinite(max) || max <= min)) return null;
    return { min: roundTo(min), max: max == null ? null : roundTo(max),
      stopped: Boolean(rawCap.stopped), autoMin: Boolean(autoMin) };
  }

  function normalizeProductCaps(values = {}) {
    const normalized = {};
    Object.entries(values || {}).forEach(([resourceId, rawCap]) => {
      const item = storageItemById[resourceId];
      const cap = item && item.capacity === 'warehouse' ? normalizeProductCap(rawCap) : null;
      if (cap && (cap.min > 0 || cap.max != null || cap.stopped)) normalized[resourceId] = cap;
    });
    return normalized;
  }

  function ensureProductCaps(ledger) {
    ledger.productCaps = normalizeProductCaps(ledger.productCaps);
    ledger.pendingProductCaps = ledger.pendingProductCaps == null
      ? null
      : normalizeProductCaps(ledger.pendingProductCaps);
    return ledger.productCaps;
  }

  function productCapFor(ledger, resourceId, usePending = false) {
    ensureProductCaps(ledger);
    const source = usePending && ledger.pendingProductCaps ? ledger.pendingProductCaps : ledger.productCaps;
    return source[resourceId] || { min: 0, max: null, stopped: false, autoMin: false };
  }

  function requestProductCap(ledger, resourceId, rawMin, rawMax, options = {}) {
    ensureProductCaps(ledger);
    const item = storageItemById[resourceId];
    if (!item || item.capacity !== 'warehouse') return { ok: false, reason: 'This product is not stored in Central Storage.' };
    let min = Number(rawMin);
    const max = rawMax == null || rawMax === '' ? null : Number(rawMax);
    if (!Number.isFinite(min) || min < 0 || (max != null && !Number.isFinite(max))) {
      return { ok: false, reason: 'Max Cap must be greater than Min Cap, or left Unlimited.' };
    }
    const autoMin = max != null && (options.autoMin === true || (min <= 0 && options.manualMin !== true));
    if (max == null) min = 0;
    else if (autoMin) min = max * 0.8;
    if (max != null && max <= min) return { ok: false, reason: 'Max Cap must be greater than Min Cap.' };
    const next = { ...(ledger.pendingProductCaps || ledger.productCaps) };
    const previous = productCapFor(ledger, resourceId);
    if (min <= 0 && max == null) delete next[resourceId];
    else next[resourceId] = { min: roundTo(min), max: max == null ? null : roundTo(max), stopped: previous.stopped, autoMin };
    ledger.pendingProductCaps = next;
    return { ok: true, applies: 'next-daily-tick', pending: next[resourceId] || { min: 0, max: null, stopped: false, autoMin: false } };
  }

  function refreshProductCapStates(ledger) {
    ensureProductCaps(ledger);
    Object.entries(ledger.productCaps).forEach(([resourceId, cap]) => {
      const current = Math.max(0, Number(ledger.available[resourceId]) || 0)
        + Math.max(0, Number(ledger.reserved[resourceId]) || 0);
      if (cap.max != null && current >= cap.max) cap.stopped = true;
      else if (current <= cap.min) cap.stopped = false;
    });
    return ledger.productCaps;
  }

  function applyPendingProductCaps(ledger) {
    ensureProductCaps(ledger);
    if (!ledger.pendingProductCaps) {
      refreshProductCapStates(ledger);
      return { applied: false, caps: ledger.productCaps };
    }
    ledger.productCaps = normalizeProductCaps(ledger.pendingProductCaps);
    ledger.pendingProductCaps = null;
    refreshProductCapStates(ledger);
    return { applied: true, caps: ledger.productCaps };
  }

  function productCapAvailability(ledger, resourceId) {
    const cap = productCapFor(ledger, resourceId);
    const current = Math.max(0, Number(ledger.available[resourceId]) || 0)
      + Math.max(0, Number(ledger.reserved[resourceId]) || 0);
    return {
      ...cap,
      current: roundTo(current),
      remaining: cap.max == null ? Number.POSITIVE_INFINITY : roundTo(Math.max(0, cap.max - current)),
      stopped: Boolean(cap.stopped && cap.max != null)
    };
  }

  function createLedger(options = {}) {
    const warehouseLevels = Math.max(0, Math.floor(Number(options.warehouseLevels) || 0));
    const capacity = Number(options.capacity ?? (FOUNDING_STORAGE_CAPACITY + warehouseLevels * WAREHOUSE_CAPACITY));
    const baseCapacity = Number(options.baseCapacity ?? (capacity - warehouseLevels * WAREHOUSE_CAPACITY));
    const available = normalizeQuantities(options.available || {});
    const reserved = normalizeQuantities(options.reserved || {});
    if (!Number.isFinite(capacity) || capacity < 0) throw new Error('Storage capacity must be non-negative.');
    if (storagePointsFor(available) + storagePointsFor(reserved) > capacity) throw new Error('Initial stock exceeds storage capacity.');
    return {
      capacity,
      baseCapacity,
      warehouseLevels,
      warehouseRegionId: options.warehouseRegionId || null,
      warehouseLevelsByRegion: { ...(options.warehouseLevelsByRegion || {}) },
      warehouseLevelOrdersByRegion: { ...(options.warehouseLevelOrdersByRegion || {}) },
      warehouseDisabledLevelsByRegion: { ...(options.warehouseDisabledLevelsByRegion || {}) },
      warehouseMaintenancePriorityByRegion: { ...(options.warehouseMaintenancePriorityByRegion || {}) },
      pendingWarehouseMaintenancePriorityByRegion: { ...(options.pendingWarehouseMaintenancePriorityByRegion || {}) },
      storageReservations: normalizeReservationMap(options.storageReservations || {}),
      pendingStorageReservations: options.pendingStorageReservations == null ? null : normalizeReservationMap(options.pendingStorageReservations),
      productCaps: normalizeProductCaps(options.productCaps || {}),
      pendingProductCaps: options.pendingProductCaps == null ? null : normalizeProductCaps(options.pendingProductCaps),
      available,
      reserved,
      paid: normalizeQuantities(options.paid || {}),
      refunded: normalizeQuantities(options.refunded || {}),
      refundLost: normalizeQuantities(options.refundLost || {}),
      founderReserveLoaded: Boolean(options.founderReserveLoaded),
      transactions: Array.isArray(options.transactions) ? [...options.transactions] : []
    };
  }

  function storageSummary(ledger) {
    const occupied = roundTo(storagePointsFor(ledger.available) + storagePointsFor(ledger.reserved), 2);
    const free = roundTo(Math.max(0, ledger.capacity - occupied), 2);
    return {
      capacity: ledger.capacity,
      occupied,
      free,
      occupancyPercent: ledger.capacity > 0 ? roundTo((occupied / ledger.capacity) * 100, 2) : 0,
      availableUnits: quantityTotal(ledger.available),
      reservedUnits: quantityTotal(ledger.reserved),
      paidUnits: quantityTotal(ledger.paid),
      refundedUnits: quantityTotal(ledger.refunded)
    };
  }

  function record(ledger, type, quantities, details = {}) {
    ledger.transactions.push({
      sequence: ledger.transactions.length + 1,
      type,
      quantities: { ...quantities },
      ...details
    });
  }

  function loadFounderReserve(ledger) {
    if (ledger.founderReserveLoaded) return storageSummary(ledger);
    const reservePoints = storagePointsFor(founderReserve);
    const current = storageSummary(ledger);
    if (current.occupied + reservePoints > ledger.capacity) {
      throw new Error('Founder Reserve exceeds free storage capacity.');
    }
    addQuantities(ledger.available, founderReserve);
    ledger.founderReserveLoaded = true;
    record(ledger, 'founder-reserve-loaded', founderReserve);
    return storageSummary(ledger);
  }

  function shortageFor(bucket, quantities) {
    return Object.entries(quantities).reduce((shortages, [resourceId, amount]) => {
      const missing = roundTo(Math.max(0, amount - (bucket[resourceId] || 0)));
      if (missing > 0) shortages[resourceId] = missing;
      return shortages;
    }, {});
  }

  function reserveMaterials(ledger, requested) {
    const quantities = normalizeQuantities(requested);
    const shortages = shortageFor(ledger.available, quantities);
    if (Object.keys(shortages).length) return { ok: false, shortages };
    addQuantities(ledger.available, quantities, -1);
    addQuantities(ledger.reserved, quantities);
    record(ledger, 'materials-reserved', quantities);
    return { ok: true, shortages: {} };
  }

  function payReservedMaterials(ledger, requested = null) {
    const quantities = normalizeQuantities(requested || ledger.reserved);
    const shortages = shortageFor(ledger.reserved, quantities);
    if (Object.keys(shortages).length) return { ok: false, shortages };
    addQuantities(ledger.reserved, quantities, -1);
    addQuantities(ledger.paid, quantities);
    record(ledger, 'reserved-materials-paid', quantities);
    return { ok: true, shortages: {} };
  }

  function payMaterials(ledger, requested) {
    const reservation = reserveMaterials(ledger, requested);
    if (!reservation.ok) return reservation;
    return payReservedMaterials(ledger, requested);
  }

  function previewRefund(ledger, requested) {
    const quantities = normalizeQuantities(requested);
    const requiredPoints = storagePointsFor(quantities);
    const shadow = {
      ...ledger,
      available: { ...ledger.available },
      reserved: { ...ledger.reserved },
      transactions: []
    };
    const admission = storeProportional(shadow, quantities, { type: 'refund-preview' });
    const acceptedPoints = admission.acceptedPoints;
    return {
      quantities,
      requiredPoints,
      freePoints: acceptedPoints,
      overflowPoints: roundTo(Math.max(0, requiredPoints - acceptedPoints), 2),
      requiresConfirmation: requiredPoints > acceptedPoints,
      admission
    };
  }

  function refundMaterials(ledger, requested, options = {}) {
    const preview = previewRefund(ledger, requested);
    if (preview.requiresConfirmation && !options.confirmOverflow) {
      return { ok: false, reason: 'refund-overflow-confirmation-required', ...preview };
    }
    const stored = storeProportional(ledger, preview.quantities, { type: 'materials-refunded' });
    addQuantities(ledger.refunded, stored.accepted);
    addQuantities(ledger.refundLost, stored.rejected);
    return { ok: true, accepted: stored.accepted, lost: stored.rejected, ...preview };
  }
  function storeProportional(ledger, requested, options = {}) {
    ensureReservations(ledger);
    const quantities = normalizeQuantities(requested);
    const requiredPoints = storagePointsFor(quantities);
    let freePoints = storageSummary(ledger).free;
    const accepted = {};
    const activeReservations = ledger.storageReservations;

    const guaranteeDeficits = () => Object.entries(activeReservations).reduce((result, [resourceId, reservedUnits]) => {
      const item = storageItemById[resourceId];
      const target = reservedUnits * item.coefficient;
      const current = ((ledger.available[resourceId] || 0) + (ledger.reserved[resourceId] || 0)
        + (accepted[resourceId] || 0)) * item.coefficient;
      result[resourceId] = Math.max(0, target - current);
      return result;
    }, {});

    const initialDeficits = guaranteeDeficits();
    const protectedRequested = {};
    Object.entries(initialDeficits).forEach(([resourceId, deficitPoints]) => {
      const item = storageItemById[resourceId];
      const amount = quantities[resourceId] || 0;
      const points = Math.min(deficitPoints, amount * item.coefficient);
      if (points > 0) protectedRequested[resourceId] = points;
    });
    const protectedTotal = Object.values(protectedRequested).reduce((sum, points) => sum + points, 0);
    const protectedRatio = protectedTotal > 0 ? Math.min(1, freePoints / protectedTotal) : 1;
    Object.entries(protectedRequested).forEach(([resourceId, points]) => {
      const amount = points * protectedRatio / storageItemById[resourceId].coefficient;
      if (amount > 0) accepted[resourceId] = roundTo(amount);
    });
    freePoints = Math.max(0, freePoints - storagePointsFor(accepted));

    const outstandingGuarantee = Object.values(guaranteeDeficits()).reduce((sum, points) => sum + points, 0);
    const generalFree = Math.max(0, freePoints - outstandingGuarantee);
    const remaining = {};
    Object.entries(quantities).forEach(([resourceId, amount]) => {
      const rest = Math.max(0, amount - (accepted[resourceId] || 0));
      if (rest > 0) remaining[resourceId] = rest;
    });
    const remainingPoints = storagePointsFor(remaining);
    const generalRatio = remainingPoints > 0 ? Math.min(1, generalFree / remainingPoints) : 1;
    Object.entries(remaining).forEach(([resourceId, amount]) => {
      const stored = roundTo(amount * generalRatio);
      if (stored > 0) accepted[resourceId] = roundTo((accepted[resourceId] || 0) + stored);
    });

    const rejected = {};
    Object.entries(quantities).forEach(([resourceId, amount]) => {
      const remainder = roundTo(Math.max(0, amount - (accepted[resourceId] || 0)));
      if (remainder > 0) rejected[resourceId] = remainder;
    });
    addQuantities(ledger.available, accepted);
    const acceptedPoints = storagePointsFor(accepted);
    const ratio = requiredPoints > 0 ? Math.min(1, acceptedPoints / requiredPoints) : 1;
    record(ledger, options.type || 'production-stored', accepted, {
      requested: quantities,
      rejected,
      storageRatio: ratio,
      reservationSummary: reservationSummary(ledger)
    });
    return {
      accepted,
      rejected,
      ratio,
      requiredPoints,
      acceptedPoints,
      rejectedPoints: storagePointsFor(rejected)
    };
  }
  function consume(ledger, resourceId, amount, transactionType = 'consumed') {
    const required = Math.max(0, Number(amount) || 0);
    const available = Math.max(0, Number(ledger.available[resourceId]) || 0);
    const consumed = roundTo(Math.min(required, available));
    const missing = roundTo(Math.max(0, required - consumed));
    if (consumed > 0) addQuantities(ledger.available, { [resourceId]: consumed }, -1);
    record(ledger, transactionType, consumed > 0 ? { [resourceId]: consumed } : {}, {
      required: { [resourceId]: roundTo(required) },
      missing: missing > 0 ? { [resourceId]: missing } : {}
    });
    return { required: roundTo(required), consumed, missing };
  }

  function consumeGroup(ledger, resourceIds, amount, transactionType = 'consumed') {
    const required = Math.max(0, Number(amount) || 0);
    const availableTotal = resourceIds.reduce((total, id) => total + Math.max(0, Number(ledger.available[id]) || 0), 0);
    const consumedTotal = Math.min(required, availableTotal);
    const consumed = {};
    if (consumedTotal > 0 && availableTotal > 0) {
      let remaining = consumedTotal;
      resourceIds.forEach((resourceId, index) => {
        const available = Math.max(0, Number(ledger.available[resourceId]) || 0);
        if (!available) return;
        const share = index === resourceIds.length - 1
          ? remaining
          : Math.min(available, consumedTotal * (available / availableTotal));
        const taken = roundTo(Math.min(available, share));
        if (taken > 0) {
          consumed[resourceId] = taken;
          remaining = roundTo(remaining - taken);
        }
      });
      if (remaining > 0) {
        resourceIds.some((resourceId) => {
          const extra = Math.min(remaining, Math.max(0, Number(ledger.available[resourceId]) || 0) - (consumed[resourceId] || 0));
          if (extra <= 0) return false;
          consumed[resourceId] = roundTo((consumed[resourceId] || 0) + extra);
          remaining = roundTo(remaining - extra);
          return remaining <= 0;
        });
      }
      addQuantities(ledger.available, consumed, -1);
    }
    const missing = roundTo(Math.max(0, required - consumedTotal));
    record(ledger, transactionType, consumed, {
      requiredAmount: roundTo(required),
      missingAmount: missing
    });
    return { required: roundTo(required), consumed, consumedTotal: roundTo(consumedTotal), missing };
  }

  function settlementForRegion(state, regionId) {
    return (state.player.cities || []).find((city) => city.regionId === regionId) || null;
  }

  function warehouseCapacityForSettlement(settlement) {
    return settlement && settlement.settlementTier === 'village'
      ? VILLAGE_WAREHOUSE_CAPACITY
      : URBAN_WAREHOUSE_CAPACITY;
  }

  function warehouseCapacityForRegion(state, regionId) {
    return warehouseCapacityForSettlement(settlementForRegion(state, regionId));
  }
  function addWarehouseLevel(ledger, levels = 1, regionId = null, capacityPerLevel = WAREHOUSE_CAPACITY) {
    const addedLevels = Math.max(0, Math.floor(Number(levels) || 0));
    ledger.warehouseLevels = Math.max(0, Number(ledger.warehouseLevels) || 0) + addedLevels;
    if (regionId) {
      ledger.warehouseRegionId = regionId;
      ledger.warehouseLevelsByRegion = ledger.warehouseLevelsByRegion || {};
      ledger.warehouseLevelsByRegion[regionId] = Math.max(
        0,
        Number(ledger.warehouseLevelsByRegion[regionId]) || 0
      ) + addedLevels;
    }
    const addedCapacity = addedLevels * Math.max(0, Number(capacityPerLevel) || 0);
    ledger.capacity += addedCapacity;
    record(ledger, 'warehouse-capacity-added', {}, {
      levels: addedLevels,
      capacityAdded: addedCapacity,
      regionId
    });
    return storageSummary(ledger);
  }

  function warehouseProjects(region) {
    if (!region) return [];
    return namespace.constructionQueue.ensureQueue(region).projects.filter((project) => (
      project.kind === 'warehouse-level'
      && ['active', 'waiting', 'paused'].includes(project.status)
    ));
  }

  function projectedWarehouseLevel(state, region) {
    const completed = state.storage.warehouseLevelsByRegion
      ? Number(state.storage.warehouseLevelsByRegion[region.id]) || 0
      : Number(state.storage.warehouseLevels) || 0;
    return Math.max(0, completed) + warehouseProjects(region).length;
  }

  function warehouseBuildAvailability(state, regionId) {
    const region = namespace.resourceSites.regionById(state, regionId);
    if (!region || region.isWater) return { allowed: false, reason: 'Select a controlled settlement province.' };
    const city = (state.player.cities || []).find((item) => item.regionId === region.id);
    if (!city) return { allowed: false, reason: 'Warehouses must be built in a settlement province.', region };
    const preview = namespace.economyData.warehousePreview(city.settlementTier);
    const capacity = namespace.developmentEconomy.canReserveDevelopment(state, city, 'warehouse');
    const shortages = namespace.resourceSites.materialShortages(state.storage, preview.materials);
    const allowed = capacity.allowed && Object.keys(shortages).length === 0;
    return {
      allowed,
      reason: !capacity.allowed
        ? capacity.reason
        : Object.keys(shortages).length
          ? 'The central stockpile lacks required construction materials.'
          : 'Ready to enter the province construction queue.',
      preview,
      shortages,
      region,
      city,
      capacity
    };
  }

  function queueWarehouse(state, regionId) {
    const availability = warehouseBuildAvailability(state, regionId);
    if (!availability.allowed) return availability;
    const targetLevel = projectedWarehouseLevel(state, availability.region) + 1;
    return namespace.constructionQueue.queueProject(state, availability.region, {
      kind: 'warehouse-level',
      buildingId: availability.preview.buildingId,
      label: availability.preview.label,
      targetLevel,
      durationDays: availability.preview.days,
      materials: availability.preview.materials,
      cashPercent: availability.preview.cashPercent,
      cashAmount: availability.preview.cashAmount,
      capacityReservation: {
        type: 'development',
        points: availability.capacity.footprint
      },
      modifiers: {}
    });
  }

  function warehouseReducePreview(state, regionId) {
    const region = namespace.resourceSites.regionById(state, regionId);
    if (!region) return { allowed: false, reason: 'City province was not found.' };
    const projects = warehouseProjects(region);
    const waiting = projects.filter((project) => project.status === 'waiting');
    const project = waiting.length
      ? waiting[waiting.length - 1]
      : projects.find((item) => item.status === 'active' || item.status === 'paused');
    if (project) {
      return {
        allowed: true,
        action: project.status === 'waiting' ? 'cancel-waiting' : 'cancel-active',
        project,
        targetLevel: Math.max(0, Number(project.targetLevel || 1) - 1),
        capacityReleased: 0,
        refund: 0,
        reason: 'Cancels the newest Warehouse expansion. No materials or cash are refunded.'
      };
    }

    const levels = Math.max(0, Number(
      state.storage.warehouseLevelsByRegion && state.storage.warehouseLevelsByRegion[region.id]
    ) || 0);
    if (levels <= 0) return { allowed: false, reason: 'No completed Warehouse level can be reduced.', refund: 0 };
    const disabledHere = Math.max(
      0,
      Number(state.storage.warehouseDisabledLevelsByRegion[region.id]) || 0
    );
    const capacityPerLevel = warehouseCapacityForRegion(state, region.id);
    const nextCapacity = state.storage.capacity - (disabledHere > 0 ? 0 : capacityPerLevel);
    const occupied = storageSummary(state.storage).occupied;
    if (occupied > nextCapacity) {
      return {
        allowed: false,
        reason: 'Move stock first. Current inventory would exceed the reduced storage capacity.',
        targetLevel: levels - 1,
        capacityReleased: capacityPerLevel,
        refund: 0
      };
    }
    return {
      allowed: true,
      action: 'reduce-completed',
      targetLevel: levels - 1,
      capacityReleased: capacityPerLevel,
      refund: 0,
      reason: 'Reduces one completed Warehouse level immediately. No materials or cash are refunded.'
    };
  }

  function reduceWarehouseLevel(state, regionId) {
    const preview = warehouseReducePreview(state, regionId);
    if (!preview.allowed) return preview;
    const region = namespace.resourceSites.regionById(state, regionId);
    if (preview.project) {
      const result = namespace.constructionQueue.discardProject(state, region, preview.project.id, preview.action);
      return { ...preview, ...result };
    }
    state.storage.warehouseLevelsByRegion[region.id] = Math.max(
      0,
      Number(state.storage.warehouseLevelsByRegion[region.id]) - 1
    );
    const orders = state.storage.warehouseLevelOrdersByRegion[region.id] || [];
    orders.pop();
    state.storage.warehouseLevelOrdersByRegion[region.id] = orders;
    state.storage.warehouseLevels = Math.max(0, Number(state.storage.warehouseLevels) - 1);
    if (state.storage.warehouseLevels === 0) state.storage.warehouseRegionId = null;
    namespace.developmentEconomy.reconcileAll(state);
    record(state.storage, 'warehouse-capacity-reduced', {}, {
      levels: 1,
      capacityRemoved: preview.capacityReleased,
      regionId
    });
    return { ok: true, ...preview };
  }

  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['warehouse-level'] = function completeWarehouse(state, region) {
    addWarehouseLevel(state.storage, 1, region.id, warehouseCapacityForRegion(state, region.id));
    namespace.developmentEconomy.ensureState(state);
    namespace.developmentEconomy.reconcileAll(state);
  };

  namespace.storageLedger = Object.freeze({
    FOUNDING_STORAGE_CAPACITY,
    WAREHOUSE_CAPACITY,
    VILLAGE_WAREHOUSE_CAPACITY,
    URBAN_WAREHOUSE_CAPACITY,
    storageItems,
    storageItemById,
    founderReserve,
    roundTo,
    normalizeQuantities,
    addQuantities,
    storagePointsFor,
    quantityTotal,
    recordTransaction: record,
    createLedger,
    storageSummary,
    eligibleReservationItems,
    ensureReservations,
    reservationSummary,
    requestReservation,
    requestStockPolicy,
    applyPendingReservations,
    normalizeProductCaps,
    ensureProductCaps,
    productCapFor,
    requestProductCap,
    applyPendingProductCaps,
    refreshProductCapStates,
    productCapAvailability,
    loadFounderReserve,
    reserveMaterials,
    payReservedMaterials,
    payMaterials,
    previewRefund,
    refundMaterials,
    storeProportional,
    consume,
    consumeGroup,
    addWarehouseLevel,
    settlementForRegion,
    warehouseCapacityForSettlement,
    warehouseCapacityForRegion,
    warehouseProjects,
    projectedWarehouseLevel,
    warehouseBuildAvailability,
    queueWarehouse,
    warehouseReducePreview,
    reduceWarehouseLevel
  });
})(window.EcoRuler = window.EcoRuler || {});
