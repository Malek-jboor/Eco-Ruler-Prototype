(function initializeSettlementLifecycle(namespace) {
  const EPSILON = 0.000001;

  function settlementById(state, settlementId) {
    return (state.player.cities || []).find((city) => city.id === settlementId) || null;
  }

  function regionFor(state, settlement) {
    return settlement ? namespace.resourceSites.regionById(state, settlement.regionId) : null;
  }

  function ensureCity(city) {
    city.lifecycleProjectId = city.lifecycleProjectId || null;
    city.satisfaction = Number.isFinite(Number(city.satisfaction))
      ? Number(city.satisfaction)
      : 60;
    city.satisfactionPenalty = city.satisfactionPenalty && Number(city.satisfactionPenalty.remainingDays) > 0
      ? { ...city.satisfactionPenalty, remainingDays: Math.max(0, Math.floor(Number(city.satisfactionPenalty.remainingDays))) }
      : null;
    return city;
  }

  function activeLifecycleProject(state, city) {
    const region = regionFor(state, city);
    if (!region) return null;
    const project = namespace.constructionQueue.ensureQueue(region).projects.find((item) => (
      item.cityId === city.id && ['settlement-advancement', 'settlement-downgrade'].includes(item.kind)
    )) || null;
    city.lifecycleProjectId = project ? project.id : null;
    return project;
  }

  function ensureState(state) {
    (state.player.cities || []).forEach((city) => {
      ensureCity(city);
      activeLifecycleProject(state, city);
      if (namespace.developmentEconomy) namespace.developmentEconomy.housingSummary(city);
    });
    state.nextLifecycleOrder = Math.max(0, Math.floor(Number(state.nextLifecycleOrder) || 0));
    return state;
  }

  function nextId(state, prefix) {
    state.nextLifecycleOrder = Math.max(0, Math.floor(Number(state.nextLifecycleOrder) || 0)) + 1;
    return `${prefix}-${state.nextLifecycleOrder}`;
  }

  function penaltyModifier(city) {
    const penalty = city && city.satisfactionPenalty;
    if (!penalty || Number(penalty.remainingDays) <= 0) return 0;
    if (penalty.kind === 'parent-transfer') return Number(penalty.remainingDays) > 60 ? -10 : -5;
    return Number(penalty.amount) || 0;
  }

  function satisfactionValue(city) {
    return Math.max(0, Math.min(100, Number(city.satisfaction)));
  }

  function setParentTransferPenalty(city) {
    city.satisfactionPenalty = { kind: 'parent-transfer', amount: -10, remainingDays: 120, totalDays: 120 };
  }

  function setDowngradePenalty(city, profile) {
    city.satisfactionPenalty = {
      kind: 'downgrade',
      amount: profile.satisfactionPenalty,
      remainingDays: profile.penaltyDays,
      totalDays: profile.penaltyDays
    };
  }

  function localDemandAtDistance(village, distance) {
    const table = namespace.administrationData.localDemand[village.specialtyId] || null;
    return table ? Math.max(0, Number(table[distance]) || 0) : 0;
  }

  function branchDemandAfterParent(state, town, village, parentTownId) {
    if (!town || town.isCapital) return { total: 0 };
    const original = village.parentTownId;
    village.parentTownId = parentTownId;
    const demand = namespace.administration.countryDemand(state, town);
    village.parentTownId = original;
    return demand;
  }

  function parentTransferPreview(state, villageId, newParentId) {
    ensureState(state);
    const village = settlementById(state, villageId);
    const newParent = settlementById(state, newParentId);
    if (!village || village.settlementTier !== 'village') return { allowed: false, reason: 'Choose an existing Village.', village, newParent };
    const oldParent = namespace.settlementHierarchy.parentTown(state, village);
    if (!newParent || !namespace.settlementHierarchy.isTownCenter(newParent)) return { allowed: false, reason: 'Choose a Town, City, or the State Capital.', village, oldParent, newParent };
    if (oldParent && oldParent.id === newParent.id) return { allowed: false, reason: 'This is already the Village parent Town.', village, oldParent, newParent };
    const distance = namespace.settlementHierarchy.provinceDistance(state, newParent.regionId, village.regionId, 3);
    if (!Number.isFinite(distance) || distance < 1 || distance > 3) return { allowed: false, reason: 'The new parent must be within three land provinces.', village, oldParent, newParent, distance };
    const demand = localDemandAtDistance(village, distance);
    const administration = namespace.administration.reconcile(state);
    const local = administration.localByCenter[newParent.id];
    const localSpare = Math.max(0, Number(local && local.spare) || 0);
    const paperCost = demand * namespace.settlementLifecycleData.parentTransfer.paperPerLocalControl;
    const paperAvailable = Math.max(0, Number(state.storage.available.paper) || 0);
    const oldCountryBefore = oldParent ? namespace.administration.countryDemand(state, oldParent) : { total: 0 };
    const newCountryBefore = namespace.administration.countryDemand(state, newParent);
    const oldCountryAfter = oldParent ? branchDemandAfterParent(state, oldParent, village, newParent.id) : { total: 0 };
    const newCountryAfter = branchDemandAfterParent(state, newParent, village, newParent.id);
    const allowed = localSpare + EPSILON >= demand && paperAvailable + EPSILON >= paperCost;
    const reason = localSpare + EPSILON < demand
      ? 'The new parent lacks enough spare Local Control for 100% coverage.'
      : paperAvailable + EPSILON < paperCost
        ? 'Central Storage lacks the required Paper.'
        : 'Ready to transfer this Village parent instantly.';
    return {
      allowed, reason, village, oldParent, newParent, distance, demand, localSpare,
      paperCost, paperAvailable,
      countryPreview: {
        oldParentBefore: oldCountryBefore.total, oldParentAfter: oldCountryAfter.total,
        newParentBefore: newCountryBefore.total, newParentAfter: newCountryAfter.total
      }
    };
  }

  function transferParent(state, villageId, newParentId) {
    const preview = parentTransferPreview(state, villageId, newParentId);
    if (!preview.allowed) return preview;
    const payment = namespace.storageLedger.payMaterials(state.storage, { paper: preview.paperCost });
    if (!payment.ok) return { ...preview, ok: false, allowed: false, reason: 'Central Storage lacks the required Paper.' };
    preview.village.parentTownId = preview.newParent.id;
    preview.village.administrativeCenterId = preview.newParent.id;
    preview.village.controlZoneCenterId = preview.newParent.id;
    setParentTransferPenalty(preview.village);
    namespace.administration.reconcile(state);
    namespace.administration.applyCollectionModifiers(state);
    namespace.resourceSites.refreshControllerModifiers(state);
    return { ok: true, ...preview, payment };
  }

  function advancementProfileFor(city) {
    if (!city) return null;
    if (city.settlementTier === 'village') return namespace.settlementLifecycleData.advancementProfiles['village-town'];
    if (city.settlementTier === 'town') return namespace.settlementLifecycleData.advancementProfiles['town-city'];
    if (city.isCapital && city.settlementTier === 'city') return namespace.settlementLifecycleData.advancementProfiles['capital-metropolis'];
    return null;
  }

  function futureTownDemand(state, city) {
    const capital = namespace.settlementHierarchy.capital(state);
    const tier = Number(namespace.administrationData.countryTierBase.town) || 20;
    const provinceDistance = capital
      ? namespace.settlementHierarchy.provinceDistance(state, capital.regionId, city.regionId)
      : Infinity;
    const distance = Number.isFinite(provinceDistance) ? Math.max(10, Math.ceil(provinceDistance / 3) * 10) : 0;
    const population = Math.ceil(Math.max(0, Number(city.population) - 2000) / 2000) * 10;
    return { total: tier + distance + population, tier, distance, population, coordination: 0, branchPopulation: Number(city.population) || 0, provinceDistance };
  }

  function advancementReservation(state, city, profile) {
    if (profile.countryReservation === 'full-new-demand') return futureTownDemand(state, city).total;
    if (profile.countryReservation === 'secondary-plus-20' && !city.isCapital) return profile.countryReservationAmount;
    return 0;
  }

  function materialShortages(state, materials) {
    return namespace.resourceSites.materialShortages(state.storage, materials);
  }

  function developmentProjection(state, city, targetTier) {
    const region = regionFor(state, city);
    const current = namespace.developmentEconomy.developmentSummary(state, city.id);
    const projectedCity = {
      ...city,
      settlementTier: targetTier,
      level: targetTier,
      settlementKind: targetTier === 'village' ? 'village' : 'urban',
      settlementIdentity: targetTier === 'village' ? 'village' : city.isCapital ? 'capital' : targetTier === 'town' ? 'town' : 'city',
      specialtyId: targetTier === 'village' ? city.specialtyId : null
    };
    const projectedTotal = namespace.developmentEconomy.developmentCapacityFor(projectedCity, region);
    const levels = [];
    (city.processingBuildings || []).forEach((building) => (building.levelOrders || []).forEach((order) => levels.push({ order, points: namespace.developmentEconomy.footprint(building.buildingId), label: building.buildingId })));
    (city.administrativeBuildings || []).forEach((building) => (building.levelOrders || []).forEach((order) => levels.push({ order, points: namespace.developmentEconomy.footprint(building.buildingId), label: building.buildingId })));
    (city.residentialDistrictLevelOrders || []).forEach((order) => levels.push({ order, points: namespace.developmentEconomy.footprint('residential-district'), label: 'residential-district' }));
    const warehouseOrders = state.storage.warehouseLevelOrdersByRegion[city.regionId] || [];
    warehouseOrders.forEach((order) => levels.push({ order, points: namespace.developmentEconomy.footprint('warehouse'), label: 'warehouse' }));
    const completed = levels.reduce((sum, level) => sum + level.points, 0);
    const reserved = Math.max(0, Number(current && current.used) - completed);
    let active = completed;
    const disabled = [];
    levels.slice().sort((a, b) => b.order - a.order).forEach((level) => {
      if (active + reserved <= projectedTotal + EPSILON) return;
      active -= level.points;
      disabled.push(level.label);
    });
    const activeWarehouses = namespace.developmentEconomy.activeWarehouseLevels(state, city.regionId);
    const currentWarehouseCapacity = namespace.storageLedger.warehouseCapacityForSettlement(city);
    const targetWarehouseCapacity = namespace.storageLedger.warehouseCapacityForSettlement(projectedCity);
    return {
      currentTotal: Number(current && current.total) || 0,
      projectedTotal,
      used: Number(current && current.used) || 0,
      reserved,
      overCapacity: Math.max(0, Number(current && current.used) - projectedTotal),
      disabled,
      warehouseCapacityDelta: activeWarehouses * (targetWarehouseCapacity - currentWarehouseCapacity)
    };
  }
  function advancementPreview(state, cityId) {
    ensureState(state);
    const city = settlementById(state, cityId);
    const profile = advancementProfileFor(city);
    if (!city || !profile) return { allowed: false, reason: 'This settlement has no available advancement.', city, profile };
    const project = activeLifecycleProject(state, city);
    if (project) return { allowed: false, reason: 'This settlement already has an active lifecycle project.', city, profile, project };
    const currentSatisfaction = satisfactionValue(city);
    const populationReady = Number(city.population) >= profile.population;
    const satisfactionReady = currentSatisfaction >= profile.satisfaction;
    let parentDistance = null;
    let distanceReady = true;
    if (profile.exactParentDistance) {
      const parent = namespace.settlementHierarchy.parentTown(state, city);
      parentDistance = parent ? namespace.settlementHierarchy.provinceDistance(state, parent.regionId, city.regionId, 3) : Infinity;
      distanceReady = parentDistance === profile.exactParentDistance;
    }
    const countryReservation = advancementReservation(state, city, profile);
    const country = namespace.administration.reconcile(state).country;
    const controlReady = Number(country.spare) + EPSILON >= countryReservation;
    const shortages = materialShortages(state, profile.materials);
    const materialsReady = Object.keys(shortages).length === 0;
    const development = developmentProjection(state, city, profile.toTier);
    const allowed = populationReady && satisfactionReady && distanceReady && controlReady && materialsReady;
    const reason = !populationReady
      ? `Population must reach ${profile.population}.`
      : !satisfactionReady
        ? `Satisfaction must reach ${profile.satisfaction}.`
        : !distanceReady
          ? 'Village advancement requires exactly three provinces from its parent Town.'
          : !controlReady
            ? 'The Capital lacks enough spare Country Control for this reservation.'
            : !materialsReady ? 'Central Storage lacks advancement materials.' : 'Ready to start this settlement advancement.';
    return {
      allowed, reason, city, profile, project, currentSatisfaction, populationReady,
      satisfactionReady, parentDistance, distanceReady, countryReservation,
      countrySpare: Number(country.spare) || 0, controlReady, shortages, materialsReady, development
    };
  }

  function addCountryReservation(state, id, amount, cityId) {
    if (amount <= EPSILON) return;
    const administration = namespace.administration.ensureState(state);
    administration.countryReservations[id] = { id, type: 'country', amount, cityId, purpose: 'settlement-advancement' };
    namespace.administration.reconcile(state);
  }

  function removeCountryReservation(state, id) {
    if (!id) return;
    const administration = namespace.administration.ensureState(state);
    delete administration.countryReservations[id];
    namespace.administration.reconcile(state);
  }

  function queueAdvancement(state, cityId) {
    const preview = advancementPreview(state, cityId);
    if (!preview.allowed) return preview;
    const region = regionFor(state, preview.city);
    const reservationId = preview.countryReservation > EPSILON ? nextId(state, 'settlement-control') : null;
    if (reservationId) addCountryReservation(state, reservationId, preview.countryReservation, preview.city.id);
    const result = namespace.constructionQueue.queueProject(state, region, {
      kind: 'settlement-advancement', cityId: preview.city.id, label: preview.profile.label,
      durationDays: preview.profile.durationDays, materials: preview.profile.materials,
      cashPercent: null, cashAmount: null, modifiers: {},
      metadata: {
        profileId: preview.profile.id,
        targetTier: preview.profile.toTier,
        countryReservationId: reservationId,
        countryReservation: preview.countryReservation
      }
    });
    if (!result.ok) {
      removeCountryReservation(state, reservationId);
      return result;
    }
    preview.city.lifecycleProjectId = result.project.id;
    return { ok: true, project: result.project, preview };
  }

  function downgradeProfileFor(city) {
    if (!city) return null;
    if (city.settlementTier === 'metropolis' && city.isCapital) return namespace.settlementLifecycleData.downgradeProfiles['metropolis-city'];
    if (city.settlementTier === 'city') return namespace.settlementLifecycleData.downgradeProfiles['city-town'];
    return null;
  }

  function downgradePreview(state, cityId) {
    ensureState(state);
    const city = settlementById(state, cityId);
    const profile = downgradeProfileFor(city);
    if (!city || !profile) return { allowed: false, reason: 'This settlement has no available downgrade.', city, profile };
    const project = activeLifecycleProject(state, city);
    if (project) return { allowed: false, reason: 'This settlement already has an active lifecycle project.', city, profile, project };
    const development = developmentProjection(state, city, profile.toTier);
    return { allowed: true, reason: 'Ready to start a no-refund settlement downgrade.', city, profile, development };
  }

  function queueDowngrade(state, cityId) {
    const preview = downgradePreview(state, cityId);
    if (!preview.allowed) return preview;
    const region = regionFor(state, preview.city);
    const result = namespace.constructionQueue.queueProject(state, region, {
      kind: 'settlement-downgrade', cityId: preview.city.id, label: preview.profile.label,
      durationDays: preview.profile.durationDays, materials: {}, cashPercent: null, cashAmount: null,
      modifiers: {}, metadata: { profileId: preview.profile.id, targetTier: preview.profile.toTier }
    });
    if (!result.ok) return result;
    preview.city.lifecycleProjectId = result.project.id;
    return { ok: true, project: result.project, preview };
  }

  function applyTier(city, tier) {
    city.settlementTier = tier;
    city.level = tier;
    if (tier === 'village') {
      city.settlementKind = 'village';
      city.settlementIdentity = 'village';
      return;
    }
    city.settlementKind = 'urban';
    city.settlementIdentity = city.isCapital ? 'capital' : tier === 'town' ? 'town' : 'city';
    city.parentTownId = null;
    city.specialtyId = null;
    city.administrativeCenterId = city.isCapital ? city.id : city.capitalId;
    city.controlZoneCenterId = city.id;
    city.controlZoneRadius = 3;
  }

  function refreshAfterTierChange(state, city, countryRequest = 'preserve') {
    namespace.settlementFoundation.migratePlayer(state);
    namespace.developmentEconomy.ensureState(state);
    namespace.developmentEconomy.reconcileAll(state);
    namespace.workforce.recalculateAll(state);
    const administration = namespace.administration.ensureState(state);
    if (!city.isCapital && namespace.settlementHierarchy.isTownCenter(city)) {
      const demand = namespace.administration.countryDemand(state, city).total;
      const current = Math.max(0, Number(administration.countryRequests[city.id]) || 0);
      administration.countryRequests[city.id] = countryRequest === 'full'
        ? demand
        : Math.min(demand, Number.isFinite(Number(countryRequest)) ? Number(countryRequest) : current);
    }
    namespace.administration.reconcile(state);
    namespace.administration.applyCollectionModifiers(state);
    namespace.resourceSites.refreshControllerModifiers(state);
  }

  function completeAdvancement(state, region, project) {
    const city = settlementById(state, project.cityId);
    if (!city) return;
    const profile = namespace.settlementLifecycleData.advancementProfiles[project.metadata.profileId];
    const administration = namespace.administration.ensureState(state);
    const previousRequest = Math.max(0, Number(administration.countryRequests[city.id]) || 0);
    removeCountryReservation(state, project.metadata.countryReservationId);
    applyTier(city, profile.toTier);
    city.lifecycleProjectId = null;
    const nextRequest = profile.id === 'village-town'
      ? 'full'
      : profile.id === 'town-city' && !city.isCapital
        ? previousRequest + Number(profile.countryReservationAmount || 0)
        : 'preserve';
    refreshAfterTierChange(state, city, nextRequest);
  }

  function completeDowngrade(state, region, project) {
    const city = settlementById(state, project.cityId);
    if (!city) return;
    const profile = namespace.settlementLifecycleData.downgradeProfiles[project.metadata.profileId];
    applyTier(city, profile.toTier);
    setDowngradePenalty(city, profile);
    city.lifecycleProjectId = null;
    refreshAfterTierChange(state, city);
  }

  function cancelLifecycleProject(state, region, project) {
    const city = settlementById(state, project.cityId);
    if (project.kind === 'settlement-advancement') removeCountryReservation(state, project.metadata.countryReservationId);
    if (city) city.lifecycleProjectId = null;
  }

  function reservationCoverage(state, project) {
    const id = project.metadata && project.metadata.countryReservationId;
    if (!id) return 1;
    const reservation = namespace.administration.reconcile(state).country.reservations[id];
    return reservation ? Number(reservation.coverage) || 0 : 0;
  }

  function refreshControlBlocks(state) {
    ensureState(state);
    state.map.regions.forEach((region) => {
      namespace.constructionQueue.ensureQueue(region).projects.forEach((project) => {
        if (project.kind !== 'settlement-advancement') return;
        const covered = reservationCoverage(state, project) >= 1 - EPSILON;
        if (!covered) {
          project.blockedReason = 'Reserved Country Control is no longer fully covered.';
          if (project.status === 'active') project.status = 'paused';
        } else if (project.blockedReason === 'Reserved Country Control is no longer fully covered.') {
          project.blockedReason = null;
          if (project.status === 'paused' && !project.manualPaused) project.status = 'active';
        }
      });
    });
  }

  function tickPenalties(state) {
    (state.player.cities || []).forEach((city) => {
      if (!city.satisfactionPenalty) return;
      city.satisfactionPenalty.remainingDays = Math.max(0, Number(city.satisfactionPenalty.remainingDays) - 1);
      if (city.satisfactionPenalty.remainingDays <= 0) city.satisfactionPenalty = null;
    });
  }

  function processDay(state) {
    ensureState(state);
    tickPenalties(state);
    refreshControlBlocks(state);
    return {
      penalties: (state.player.cities || []).filter((city) => city.satisfactionPenalty).map((city) => ({ cityId: city.id, ...city.satisfactionPenalty, modifier: penaltyModifier(city) }))
    };
  }

  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['settlement-advancement'] = completeAdvancement;
  namespace.constructionProjectHandlers['settlement-downgrade'] = completeDowngrade;
  namespace.constructionProjectCancellationHandlers = namespace.constructionProjectCancellationHandlers || {};
  namespace.constructionProjectCancellationHandlers['settlement-advancement'] = cancelLifecycleProject;
  namespace.constructionProjectCancellationHandlers['settlement-downgrade'] = cancelLifecycleProject;

  namespace.settlementLifecycle = Object.freeze({
    ensureState,
    settlementById,
    activeLifecycleProject,
    penaltyModifier,
    satisfactionValue,
    parentTransferPreview,
    transferParent,
    advancementProfileFor,
    developmentProjection,
    advancementPreview,
    queueAdvancement,
    downgradeProfileFor,
    downgradePreview,
    queueDowngrade,
    refreshControlBlocks,
    processDay
  });
})(window.EcoRuler = window.EcoRuler || {});
