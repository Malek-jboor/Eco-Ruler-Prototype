(function initializeOutpostLifecycle(namespace) {
  const EPSILON = 0.000001;

  const round = (value, digits = 4) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  };

  function ensureState(state) {
    state.expansion = state.expansion || {};
    state.expansion.nextOrderNumber = Math.max(1, Math.floor(Number(state.expansion.nextOrderNumber) || 1));
    state.expansion.settlerOrders = Array.isArray(state.expansion.settlerOrders)
      ? state.expansion.settlerOrders
      : [];
    return state.expansion;
  }

  function nextOrderId(state, prefix = 'transfer') {
    const expansion = ensureState(state);
    const id = `${prefix}-${expansion.nextOrderNumber}`;
    expansion.nextOrderNumber += 1;
    return id;
  }

  function regionById(state, regionId) {
    return (state.map.regions || []).find((region) => region.id === regionId) || null;
  }

  function outpostById(state, outpostId) {
    return (state.player.outposts || []).find((outpost) => outpost.id === outpostId) || null;
  }

  function settlementById(state, settlementId) {
    return (state.player.cities || []).find((city) => city.id === settlementId) || null;
  }

  function landDistance(state, fromRegionId, toRegionId, maximum = Infinity) {
    if (!fromRegionId || !toRegionId) return Infinity;
    if (fromRegionId === toRegionId) return 0;
    const visited = new Set([fromRegionId]);
    let frontier = [fromRegionId];
    let distance = 0;
    while (frontier.length && distance < maximum) {
      distance += 1;
      const next = [];
      for (const regionId of frontier) {
        const region = regionById(state, regionId);
        for (const neighborId of (region ? region.neighbors : [])) {
          if (visited.has(neighborId)) continue;
          const neighbor = regionById(state, neighborId);
          if (!neighbor || neighbor.isWater) continue;
          if (neighborId === toRegionId) return distance;
          visited.add(neighborId);
          next.push(neighborId);
        }
      }
      frontier = next;
    }
    return Infinity;
  }

  function controlledBorderDistance(state, settlement, destinationRegionId) {
    const starts = new Set(settlement && settlement.controlledRegionIds || []);
    if (settlement && settlement.regionId) starts.add(settlement.regionId);
    return Math.min(...Array.from(starts).map((regionId) => (
      landDistance(state, regionId, destinationRegionId, 3)
    )));
  }

  function retainedPopulation(settlement) {
    return settlement && (settlement.settlementKind === 'village' || settlement.settlementIdentity === 'village')
      ? 50
      : 500;
  }
  function internalTransferAvailability(settlement) {
    const population = Math.max(0, Number(settlement && settlement.population) || 0);
    const workforce = Math.min(population, Math.max(0, Number(settlement && settlement.workforceTotal) || 0));
    const availableWorkforce = Math.min(
      workforce,
      Math.max(0, Number(settlement && settlement.workforceAvailable) || 0)
    );
    const assignedWorkforce = Math.max(0, workforce - availableWorkforce);
    const nonWorkforce = Math.max(0, population - workforce);
    const populationAboveFloor = Math.max(0, population - retainedPopulation(settlement));
    const maxTransferable = Math.max(0, Math.floor(Math.min(
      populationAboveFloor,
      availableWorkforce / 0.6,
      nonWorkforce / 0.4
    ) + EPSILON));
    return {
      population,
      workforce,
      assignedWorkforce,
      availableWorkforce,
      nonWorkforce,
      retainedPopulation: retainedPopulation(settlement),
      maxTransferable
    };
  }


  function availableSettlers(settlement) {
    return Math.max(0, Math.floor((Number(settlement && settlement.population) || 0) - retainedPopulation(settlement)));
  }

  function foodRequirement(amount, distance) {
    const total = round(
      Math.max(0, Math.floor(Number(amount) || 0))
      * namespace.expansionData.FOOD_PER_PERSON_PER_PROVINCE
      * Math.max(0, Math.floor(Number(distance) || 0))
    );
    return {
      total,
      bread: round(total * namespace.expansionData.FOOD_SHARES.bread),
      protein: round(total * namespace.expansionData.FOOD_SHARES.protein),
      vegetables: round(total * namespace.expansionData.FOOD_SHARES.vegetables),
      fruit: round(total * namespace.expansionData.FOOD_SHARES.fruit)
    };
  }

  function foodPlan(state, amount, distance) {
    const required = foodRequirement(amount, distance);
    const available = state.storage.available || {};
    const payment = {
      bread: required.bread,
      vegetables: required.vegetables,
      fruit: required.fruit
    };
    let proteinRemaining = required.protein;
    namespace.expansionData.PROTEIN_RESOURCES.forEach((resourceId) => {
      const taken = Math.min(proteinRemaining, Math.max(0, Number(available[resourceId]) || 0));
      if (taken > EPSILON) payment[resourceId] = round(taken);
      proteinRemaining = round(proteinRemaining - taken);
    });
    const shortages = {};
    if ((available.bread || 0) + EPSILON < required.bread) shortages.bread = round(required.bread - (available.bread || 0));
    if ((available.vegetables || 0) + EPSILON < required.vegetables) shortages.vegetables = round(required.vegetables - (available.vegetables || 0));
    if ((available.fruit || 0) + EPSILON < required.fruit) shortages.fruit = round(required.fruit - (available.fruit || 0));
    if (proteinRemaining > EPSILON) shortages.protein = proteinRemaining;
    return { required, payment, shortages, ok: Object.keys(shortages).length === 0 };
  }

  function payFood(state, plan) {
    if (!plan.ok) return { ok: false, reason: 'Not enough food for this journey.', shortages: plan.shortages };
    const result = namespace.storageLedger.payMaterials(state.storage, plan.payment);
    return result.ok ? { ok: true, paid: { ...plan.payment } } : result;
  }

  function refundFood(state, paid) {
    return namespace.storageLedger.refundMaterials(state.storage, paid || {}, { confirmOverflow: true });
  }

  function deductPeople(state, settlement, amount) {
    const moved = Math.max(0, Math.floor(Number(amount) || 0));
    settlement.population = Math.max(0, Number(settlement.population) - moved);
    settlement.commoners = Math.max(0, Number(settlement.commoners || settlement.population) - moved);
    settlement.workforceTotal = Math.max(0, Number(settlement.workforceTotal) - moved);
    namespace.workforce.recalculateAll(state);
  }

  function restorePeople(state, settlement, amount) {
    const moved = Math.max(0, Math.floor(Number(amount) || 0));
    settlement.population = Math.max(0, Number(settlement.population) || 0) + moved;
    settlement.commoners = Math.max(0, Number(settlement.commoners) || 0) + moved;
    settlement.workforceTotal = Math.max(0, Number(settlement.workforceTotal) || 0) + moved;
    namespace.workforce.recalculateAll(state);
  }

  function materialShortages(state, materials) {
    return Object.entries(materials || {}).reduce((result, [resourceId, amount]) => {
      const missing = round(Math.max(0, Number(amount) - (Number(state.storage.available[resourceId]) || 0)));
      if (missing > EPSILON) result[resourceId] = missing;
      return result;
    }, {});
  }

  function foundingProjects(state) {
    return (state.map.regions || []).flatMap((region) => (
      namespace.constructionQueue.ensureQueue(region).projects.filter((project) => (
        project.kind === 'outpost-founding' && ['active', 'waiting', 'paused'].includes(project.status)
      ))
    ));
  }

  function committedFoundingSettlers(state, sourceId) {
    return foundingProjects(state).reduce((total, project) => {
      const metadata = project.metadata || {};
      return metadata.sourceId === sourceId && !metadata.settlersDeparted
        ? total + Math.max(0, Number(metadata.settlers) || 0)
        : total;
    }, 0);
  }

  function activeOrdersForOutpost(state, outpostId) {
    return ensureState(state).settlerOrders.filter((order) => (
      order.outpostId === outpostId && ['departure-pending', 'in-transit'].includes(order.status)
    ));
  }

  function incomingSettlers(state, outpostId) {
    return activeOrdersForOutpost(state, outpostId)
      .filter((order) => order.destinationType === 'outpost')
      .reduce((sum, order) => sum + Math.max(0, Number(order.amount) || 0), 0);
  }

  function foundingPreview(state, sourceId, destinationRegionId) {
    const source = settlementById(state, sourceId);
    const region = regionById(state, destinationRegionId);
    if (!state.player.gameStarted) return { allowed: false, reason: 'Start the game first.', source, region };
    if (!source || source.settlementKind === 'village') return { allowed: false, reason: 'Choose an owned Town, City, or the Capital as the expedition source.', source, region };
    if (!region || region.isWater || region.ownerId || region.controllerId) return { allowed: false, reason: 'Choose an unowned revealed land province.', source, region };
    if (!region.discovered) return { allowed: false, reason: 'The destination is still hidden by fog of war.', source, region };
    const distance = controlledBorderDistance(state, source, region.id);
    const profile = namespace.expansionData.foundingByDistance[distance];
    if (!profile) return { allowed: false, reason: 'The destination must be within three land provinces of the source border.', source, region, distance };
    const settlers = namespace.expansionData.OUTPOST_FOUNDING_SETTLERS;
    const committedSettlers = committedFoundingSettlers(state, source.id);
    const settlersAvailable = Math.max(0, availableSettlers(source) - committedSettlers);
    const freeWorkers = Math.max(0, (Number(source.workforceAvailable) || 0) - committedSettlers);
    const food = foodPlan(state, settlers, distance);
    const materials = { ...namespace.expansionData.foundingMaterials(distance) };
    const shortages = materialShortages(state, materials);
    const allowed = settlersAvailable >= settlers
      && freeWorkers >= settlers
      && food.ok
      && Object.keys(shortages).length === 0;
    const reason = settlersAvailable < settlers
      ? `The source must retain ${retainedPopulation(source)} residents after its queued expeditions.`
      : freeWorkers < settlers
        ? 'The source needs 50 uncommitted available workers for the expedition.'
        : !food.ok
          ? 'Central Storage lacks the required expedition food.'
          : Object.keys(shortages).length
            ? 'Central Storage lacks the required founding materials.'
            : 'Ready to start the Outpost founding project.';
    return {
      allowed, reason, source, region, distance, profile, settlers, committedSettlers,
      settlersAvailable, freeWorkers, food, materials, shortages
    };
  }

  function queueFounding(state, sourceId, destinationRegionId) {
    const preview = foundingPreview(state, sourceId, destinationRegionId);
    if (!preview.allowed) return preview;
    const foodPayment = payFood(state, preview.food);
    if (!foodPayment.ok) return { ...preview, allowed: false, ...foodPayment };
    const result = namespace.constructionQueue.queueProject(state, preview.region, {
      kind: 'outpost-founding',
      label: 'Found Outpost',
      durationDays: preview.profile.durationDays,
      materials: preview.materials,
      cashPercent: null,
      cashAmount: null,
      metadata: {
        sourceId: preview.source.id,
        settlers: preview.settlers,
        distance: preview.distance,
        foodPaid: foodPayment.paid,
        settlersDeparted: false
      }
    });
    if (!result.ok) {
      refundFood(state, foodPayment.paid);
      return result;
    }
    return { ok: true, project: result.project, preview };
  }

  function nextSettlementId(state) {
    let index = (state.player.cities || []).length + 1;
    let id = `city-${index}`;
    while (settlementById(state, id)) { index += 1; id = `city-${index}`; }
    return id;
  }

  function nextOutpostIdentity(state) {
    let index = (state.player.outposts || []).length + 1;
    let id = `outpost-${index}`;
    while (outpostById(state, id)) { index += 1; id = `outpost-${index}`; }
    return { id, name: `Outpost ${index}` };
  }

  function startFounding(state, region, project) {
    const metadata = project.metadata || {};
    if (metadata.settlersDeparted) return { ok: true };
    const source = settlementById(state, metadata.sourceId);
    if (!source) return { ok: false, reason: 'The expedition source no longer exists.' };
    if (availableSettlers(source) < metadata.settlers) {
      return { ok: false, reason: `The source must retain ${retainedPopulation(source)} residents before the founders depart.` };
    }
    if (Math.max(0, Number(source.workforceAvailable) || 0) < metadata.settlers) {
      return { ok: false, reason: 'The source needs 50 available workers before the founders depart.' };
    }
    deductPeople(state, source, metadata.settlers);
    metadata.settlersDeparted = true;
    return { ok: true };
  }

  function completeFounding(state, region, project) {
    const metadata = project.metadata || {};
    const identity = nextOutpostIdentity(state);
    const outpost = namespace.models.createOutpost({
      id: identity.id,
      name: identity.name,
      regionId: region.id,
      originSettlementId: metadata.sourceId,
      capitalId: state.player.capitalSettlementId || state.player.capitalId || null,
      population: metadata.settlers,
      workforceTotal: metadata.settlers,
      workforceAvailable: metadata.settlers,
      housingCapacity: metadata.settlers,
      foundingDistance: metadata.distance
    });
    region.ownerId = 'player';
    region.controllerId = 'player';
    region.discovered = true;
    state.player.outposts.push(outpost);
    namespace.workforce.recalculateAll(state);
    if (namespace.uiRealm) namespace.uiRealm.refreshPlayerVisibility(state);
    return outpost;
  }

  function transferPreview(state, sourceId, outpostId, amount) {
    const source = settlementById(state, sourceId);
    const outpost = outpostById(state, outpostId);
    const moved = Math.max(0, Math.floor(Number(amount) || 0));
    if (!source || !outpost) return { allowed: false, reason: 'Choose a valid settlement source and Outpost.', source, outpost, amount: moved };
    if (moved <= 0) return { allowed: false, reason: 'Enter at least one settler.', source, outpost, amount: moved };
    const distance = landDistance(state, source.regionId, outpost.regionId);
    if (!Number.isFinite(distance) || distance <= 0) return { allowed: false, reason: 'No valid land route reaches this Outpost.', source, outpost, amount: moved, distance };
    const projected = Number(outpost.population) + incomingSettlers(state, outpost.id) + moved;
    const food = foodPlan(state, moved, distance);
    const sourceAvailable = Math.max(0, availableSettlers(source) - committedFoundingSettlers(state, source.id));
    const allowed = sourceAvailable >= moved
      && projected <= namespace.expansionData.MAX_OUTPOST_POPULATION_FROM_SETTLERS
      && food.ok;
    const reason = sourceAvailable < moved
      ? `The source must retain ${retainedPopulation(source)} residents after its queued expeditions.`
      : projected > namespace.expansionData.MAX_OUTPOST_POPULATION_FROM_SETTLERS
        ? 'Player-sent settlers cannot raise projected Outpost population above 500.'
        : !food.ok ? 'Central Storage lacks the required travel food.' : 'Ready to send this settler group.';
    return {
      allowed, reason, source, outpost, amount: moved, distance, food, sourceAvailable,
      durationDays: distance * namespace.expansionData.TRAVEL_DAYS_PER_PROVINCE,
      projectedPopulation: projected,
      sourcePopulationAfter: Number(source.population) - moved,
      sourceWorkforceAfter: Math.max(0, Number(source.workforceTotal) - moved)
    };
  }

  function sendSettlers(state, sourceId, outpostId, amount) {
    const preview = transferPreview(state, sourceId, outpostId, amount);
    if (!preview.allowed) return preview;
    const foodPayment = payFood(state, preview.food);
    if (!foodPayment.ok) return { ...preview, allowed: false, ...foodPayment };
    deductPeople(state, preview.source, preview.amount);
    const order = {
      id: nextOrderId(state),
      kind: 'settlers',
      sourceId: preview.source.id,
      destinationId: preview.outpost.id,
      destinationType: 'outpost',
      outpostId: preview.outpost.id,
      amount: preview.amount,
      distance: preview.distance,
      durationDays: preview.durationDays,
      remainingDays: preview.durationDays,
      foodPaid: foodPayment.paid,
      status: 'departure-pending',
      createdTick: Math.max(0, Number(state.clock.processedDays) || 0)
    };
    ensureState(state).settlerOrders.push(order);
    return { ok: true, order, preview };
  }

  function internalTransferPreview(state, sourceId, destinationId, amount) {
    const source = settlementById(state, sourceId);
    const destination = settlementById(state, destinationId);
    const moved = Math.max(0, Math.floor(Number(amount) || 0));
    if (!source || !destination || source.id === destination.id) return { allowed: false, reason: 'Choose a different owned settlement source.', source, destination, amount: moved };
    if (moved <= 0) return { allowed: false, reason: 'Enter at least one resident.', source, destination, amount: moved };
    const distance = landDistance(state, source.regionId, destination.regionId);
    const availability = internalTransferAvailability(source);
    const sourceAvailable = availability.maxTransferable;
    const food = foodPlan(state, moved, distance);
    const workforceAmount = round(moved * 0.6);
    const nonWorkforceAmount = moved - workforceAmount;
    const allowed = Number.isFinite(distance) && distance > 0 && sourceAvailable >= moved && food.ok;
    return {
      allowed,
      reason: !Number.isFinite(distance) ? 'No valid land route connects these settlements.' : sourceAvailable < moved ? `The source must retain ${retainedPopulation(source)} residents.` : !food.ok ? 'Central Storage lacks the required travel food.' : 'Ready to send this resident caravan.',
      source, destination, amount: moved, distance, food, availability, sourceAvailable, workforceAmount, nonWorkforceAmount,
      durationDays: distance * namespace.expansionData.TRAVEL_DAYS_PER_PROVINCE,
      sourcePopulationAfter: Number(source.population) - moved,
      sourceWorkforceAfter: Math.max(0, Number(source.workforceTotal) - workforceAmount),
      sourceHousingCapacity: Number(source.housingCapacity) || 0,
      destinationPopulationAfter: Number(destination.population) + moved,
      destinationWorkforceAfter: Number(destination.workforceTotal) + workforceAmount,
      destinationHousingCapacity: Number(destination.housingCapacity) || 0,
      destinationHousingShortageAfter: Math.max(0, Number(destination.population) + moved - (Number(destination.housingCapacity) || 0))
    };
  }

  function sendInternalResidents(state, sourceId, destinationId, amount) {
    const preview = internalTransferPreview(state, sourceId, destinationId, amount);
    if (!preview.allowed) return preview;
    const foodPayment = payFood(state, preview.food);
    if (!foodPayment.ok) return { ...preview, allowed: false, ...foodPayment };
    preview.source.population -= preview.amount;
    preview.source.commoners = Math.max(0, Number(preview.source.commoners) - preview.amount);
    preview.source.workforceTotal = Math.max(0, Number(preview.source.workforceTotal) - preview.workforceAmount);
    const order = { id: nextOrderId(state, 'internal-transfer'), kind: 'internal-transfer', sourceId, destinationId, destinationType: 'settlement', amount: preview.amount, workforceAmount: preview.workforceAmount, nonWorkforceAmount: preview.nonWorkforceAmount, distance: preview.distance, durationDays: preview.durationDays, remainingDays: preview.durationDays, foodPaid: foodPayment.paid, status: 'departure-pending', createdTick: Math.max(0, Number(state.clock.processedDays) || 0) };
    ensureState(state).settlerOrders.push(order);
    namespace.workforce.recalculateAll(state);
    return { ok: true, order, preview };
  }
  function cancelSettlerOrder(state, orderId) {
    const order = ensureState(state).settlerOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'departure-pending') return { ok: false, reason: 'This order is already in transit and cannot be cancelled.' };
    const source = settlementById(state, order.sourceId);
    if (source && order.kind === 'internal-transfer') {
      source.population += order.amount;
      source.commoners = Math.max(0, Number(source.commoners) || 0) + order.amount;
      source.workforceTotal += order.workforceAmount;
      namespace.workforce.recalculateAll(state);
    } else if (source) restorePeople(state, source, order.amount);
    refundFood(state, order.foodPaid);
    order.status = 'cancelled';
    order.remainingDays = 0;
    return { ok: true, order };
  }

  function localDemandFor(state, parent, region, specialtyId) {
    const distance = landDistance(state, parent.regionId, region.id, 3);
    const table = namespace.administrationData.localDemand[specialtyId];
    return { distance, total: table && Number.isFinite(distance) ? Number(table[distance]) || 0 : 0 };
  }

  function specialtyEligible(region, specialtyId) {
    if (specialtyId === 'trade' || specialtyId === 'military') return true;
    const resources = namespace.developmentData.specialtyResources[specialtyId];
    return Boolean(resources && (region.resourceCandidates || []).some((candidate) => (
      candidate.available && resources.has(candidate.resourceId)
    )));
  }

  function currentSiteCompatibility(region, specialtyId) {
    const site = (region.resourceSites || []).find((item) => item.level > 0) || null;
    if (!site) return { compatible: true, resourceId: null, reason: 'No completed Resource Site yet.' };
    const resources = namespace.developmentData.specialtyResources[specialtyId];
    if (!resources) return { compatible: true, resourceId: site.resourceId, reason: 'This specialty gives no matching raw-resource bonus.' };
    const compatible = resources.has(site.resourceId);
    return { compatible, resourceId: site.resourceId, reason: compatible ? 'The current site receives the matching specialty bonus.' : 'The current site remains usable but receives no matching specialty bonus.' };
  }

  function villageConversionPreview(state, outpostId, parentTownId, specialtyId) {
    const outpost = outpostById(state, outpostId);
    const parent = settlementById(state, parentTownId);
    const region = outpost ? regionById(state, outpost.regionId) : null;
    const specialty = namespace.developmentData.villageSpecialties[specialtyId] || null;
    if (!outpost || !parent || !region || !namespace.settlementHierarchy.isTownCenter(parent)) {
      return { allowed: false, reason: 'Choose a valid Outpost and parent Town.', outpost, parent, region, specialty };
    }
    if (outpost.conversionProjectId) return { allowed: false, reason: 'This Outpost already has an active conversion.', outpost, parent, region, specialty };
    const demand = localDemandFor(state, parent, region, specialtyId);
    if (!Number.isFinite(demand.distance) || demand.distance < 1 || demand.distance > 3) {
      return { allowed: false, reason: 'The parent Town must be within three land provinces.', outpost, parent, region, specialty, demand };
    }
    if (!specialty) return { allowed: false, reason: 'Choose one Village specialty.', outpost, parent, region, specialty, demand };
    if (!specialtyEligible(region, specialtyId)) return { allowed: false, reason: 'This province has no eligible raw resource for that specialty.', outpost, parent, region, specialty, demand };
    const profile = namespace.expansionData.conversionProfiles.village;
    const materials = { ...profile.materials };
    const shortages = materialShortages(state, materials);
    const administration = namespace.administration.reconcile(state);
    const local = administration.localByCenter[parent.id];
    const localSpare = Math.max(0, Number(local && local.spare) || 0);
    const allowed = localSpare + EPSILON >= demand.total && Object.keys(shortages).length === 0;
    const reason = localSpare + EPSILON < demand.total
      ? 'The parent Town lacks enough spare Local Control.'
      : Object.keys(shortages).length ? 'Central Storage lacks conversion materials.' : 'Ready to convert this Outpost to a Village.';
    return {
      allowed, reason, outpost, parent, region, specialty, demand, profile, materials, shortages,
      localSpare, compatibility: currentSiteCompatibility(region, specialtyId)
    };
  }

  function futureTownDemand(state, outpost) {
    const temporary = {
      id: '__future-town__',
      population: Math.max(0, Number(outpost.population) || 0),
      settlementTier: 'town',
      level: 'town',
      settlementKind: 'urban',
      isCapital: false,
      regionId: outpost.regionId,
      administrativeBuildings: []
    };
    return namespace.administration.countryDemand(state, temporary);
  }

  function townConversionPreview(state, outpostId) {
    const outpost = outpostById(state, outpostId);
    const region = outpost ? regionById(state, outpost.regionId) : null;
    if (!outpost || !region) return { allowed: false, reason: 'Outpost was not found.', outpost, region };
    if (outpost.conversionProjectId) return { allowed: false, reason: 'This Outpost already has an active conversion.', outpost, region };
    const profile = namespace.expansionData.conversionProfiles.town;
    const materials = { ...profile.materials };
    const shortages = materialShortages(state, materials);
    const demand = futureTownDemand(state, outpost);
    const administration = namespace.administration.reconcile(state);
    const countrySpare = Math.max(0, Number(administration.country.spare) || 0);
    const populationReady = Number(outpost.population) >= 500;
    const allowed = populationReady && countrySpare + EPSILON >= demand.total && Object.keys(shortages).length === 0;
    const reason = !populationReady
      ? 'The Outpost needs 500 arrived residents.'
      : countrySpare + EPSILON < demand.total
        ? 'The Capital lacks enough spare Country Control.'
        : Object.keys(shortages).length ? 'Central Storage lacks conversion materials.' : 'Ready to convert this Outpost to a Town.';
    return { allowed, reason, outpost, region, profile, materials, shortages, demand, countrySpare };
  }

  function addReservation(state, reservation) {
    const administration = namespace.administration.ensureState(state);
    const bucket = reservation.type === 'country' ? 'countryReservations' : 'localReservations';
    administration[bucket][reservation.id] = { ...reservation };
    namespace.administration.reconcile(state);
  }

  function removeReservation(state, reservationId, type) {
    const administration = namespace.administration.ensureState(state);
    delete administration[type === 'country' ? 'countryReservations' : 'localReservations'][reservationId];
    namespace.administration.reconcile(state);
  }

  function queueConversion(state, outpostId, type, options = {}) {
    const preview = type === 'village'
      ? villageConversionPreview(state, outpostId, options.parentTownId, options.specialtyId)
      : townConversionPreview(state, outpostId);
    if (!preview.allowed) return preview;
    const reservationId = nextOrderId(state, `${type}-control`);
    const reservation = type === 'village'
      ? { id: reservationId, type: 'local', centerId: preview.parent.id, amount: preview.demand.total, outpostId }
      : { id: reservationId, type: 'country', amount: preview.demand.total, outpostId };
    addReservation(state, reservation);
    const result = namespace.constructionQueue.queueProject(state, preview.region, {
      kind: 'outpost-conversion',
      label: preview.profile.label,
      durationDays: preview.profile.durationDays,
      materials: preview.materials,
      cashPercent: null,
      cashAmount: null,
      metadata: {
        outpostId,
        conversionType: type,
        parentTownId: type === 'village' ? preview.parent.id : null,
        specialtyId: type === 'village' ? preview.specialty.id : null,
        controlReservationId: reservationId,
        controlType: reservation.type,
        controlDemand: reservation.amount,
        founderHousing: preview.profile.founderHousing
      }
    });
    if (!result.ok) {
      removeReservation(state, reservationId, reservation.type);
      return result;
    }
    preview.outpost.conversionProjectId = result.project.id;
    namespace.administration.reconcile(state);
    return { ok: true, project: result.project, preview };
  }

  function reservationCoverage(state, metadata) {
    const administration = namespace.administration.reconcile(state);
    if (metadata.controlType === 'country') {
      const reservation = administration.country.reservations[metadata.controlReservationId];
      return reservation ? reservation.coverage : 0;
    }
    const local = administration.localByCenter[metadata.parentTownId];
    const reservation = local && local.reservations[metadata.controlReservationId];
    return reservation ? reservation.coverage : 0;
  }

  function refreshConversionBlocks(state) {
    state.map.regions.forEach((region) => {
      namespace.constructionQueue.ensureQueue(region).projects.forEach((project) => {
        if (project.kind !== 'outpost-conversion') return;
        const covered = reservationCoverage(state, project.metadata || {}) >= 1 - EPSILON;
        if (!covered) {
          project.blockedReason = 'Reserved Control is no longer fully covered.';
          if (project.status === 'active') project.status = 'paused';
        } else if (project.blockedReason === 'Reserved Control is no longer fully covered.') {
          project.blockedReason = null;
          if (project.status === 'paused' && !project.manualPaused) project.status = 'active';
        }
      });
    });
  }

  function completeConversion(state, region, project) {
    const metadata = project.metadata || {};
    const outpost = outpostById(state, metadata.outpostId);
    if (!outpost) return null;
    removeReservation(state, metadata.controlReservationId, metadata.controlType);
    const isVillage = metadata.conversionType === 'village';
    const sameKindCount = (state.player.cities || []).filter((city) => (
      isVillage ? city.settlementKind === 'village' : (!city.isCapital && city.settlementKind !== 'village')
    )).length;
    const city = namespace.models.createCity({
      id: nextSettlementId(state),
      name: `${isVillage ? 'Village' : 'Town'} ${sameKindCount + 1}`,
      regionId: outpost.regionId,
      controlledRegionIds: [outpost.regionId],
      settlementKind: isVillage ? 'village' : 'urban',
      settlementIdentity: isVillage ? 'village' : 'town',
      settlementTier: isVillage ? 'village' : 'town',
      capitalId: state.player.capitalSettlementId || state.player.capitalId || null,
      parentTownId: isVillage ? metadata.parentTownId : null,
      specialtyId: isVillage ? metadata.specialtyId : null,
      population: outpost.population,
      commoners: outpost.population,
      nobles: 0,
      workforceTotal: outpost.workforceTotal,
      workforceAssigned: outpost.workforceAssigned,
      workforceAvailable: outpost.workforceAvailable,
      housingCapacity: metadata.founderHousing
    });
    city.housingCapacity = metadata.founderHousing;
    state.player.outposts = state.player.outposts.filter((item) => item !== outpost);
    state.player.cities.push(city);
    namespace.settlementFoundation.migratePlayer(state);
    if (!isVillage) {
      const demand = namespace.administration.countryDemand(state, city);
      state.administration.countryRequests[city.id] = demand.total;
    }
    namespace.developmentEconomy.ensureState(state);
    namespace.developmentEconomy.reconcileAll(state);
    namespace.workforce.recalculateAll(state);
    namespace.administration.reconcile(state);
    namespace.administration.applyCollectionModifiers(state);
    namespace.resourceSites.refreshControllerModifiers(state);
    return city;
  }

  function cancelLifecycleProject(state, region, project, context = {}) {
    const metadata = project.metadata || {};
    if (project.kind === 'outpost-conversion') {
      removeReservation(state, metadata.controlReservationId, metadata.controlType);
      const outpost = outpostById(state, metadata.outpostId);
      if (outpost) outpost.conversionProjectId = null;
      namespace.resourceSites.refreshControllerModifiers(state);
      return;
    }
    if (project.kind !== 'outpost-founding') return;
    if (!metadata.settlersDeparted) {
      refundFood(state, metadata.foodPaid);
      return;
    }
    ensureState(state).settlerOrders.push({
      id: nextOrderId(state, 'founder-return'),
      kind: 'founding-return',
      sourceId: project.provinceId,
      destinationId: metadata.sourceId,
      destinationType: 'settlement',
      amount: metadata.settlers,
      distance: metadata.distance,
      durationDays: 10 * metadata.distance,
      remainingDays: 10 * metadata.distance,
      foodPaid: {},
      status: 'in-transit'
    });
  }

  function relocationPreview(state, outpostId, destinationId, amount = null) {
    const outpost = outpostById(state, outpostId);
    const destination = settlementById(state, destinationId);
    const moved = amount === null ? Math.max(0, Math.floor(Number(outpost && outpost.population) || 0)) : Math.max(0, Math.floor(Number(amount) || 0));
    if (!outpost || !destination) return { allowed: false, reason: 'Choose a valid Outpost and owned settlement.', outpost, destination, amount: moved };
    if (moved <= 0 || moved > Number(outpost.population)) return { allowed: false, reason: 'Choose a resident amount available at the Outpost.', outpost, destination, amount: moved };
    const distance = landDistance(state, outpost.regionId, destination.regionId);
    if (!Number.isFinite(distance) || distance <= 0) return { allowed: false, reason: 'No valid land route reaches that settlement.', outpost, destination, amount: moved, distance };
    const food = foodPlan(state, moved, distance);
    return {
      allowed: food.ok,
      reason: food.ok ? 'Ready to relocate these residents.' : 'Central Storage lacks the required relocation food.',
      outpost, destination, amount: moved, distance, food,
      durationDays: distance * namespace.expansionData.TRAVEL_DAYS_PER_PROVINCE,
      destinationPopulationAfter: Number(destination.population) + moved,
      destinationWorkforceAfter: Number(destination.workforceTotal) + moved,
      destinationHousingCapacity: Math.max(0, Number(destination.housingCapacity) || 0),
      destinationHousingShortageAfter: Math.max(
        0,
        Number(destination.population) + moved - Math.max(0, Number(destination.housingCapacity) || 0)
      )
    };
  }

  function relocateResidents(state, outpostId, destinationId, amount = null) {
    const preview = relocationPreview(state, outpostId, destinationId, amount);
    if (!preview.allowed) return preview;
    const payment = payFood(state, preview.food);
    if (!payment.ok) return payment;
    preview.outpost.population -= preview.amount;
    preview.outpost.workforceTotal = Math.max(0, Number(preview.outpost.workforceTotal) - preview.amount);
    const order = {
      id: nextOrderId(state, 'relocation'),
      kind: 'relocation',
      sourceId: preview.outpost.id,
      destinationId: preview.destination.id,
      destinationType: 'settlement',
      outpostId: preview.outpost.id,
      amount: preview.amount,
      distance: preview.distance,
      durationDays: preview.durationDays,
      remainingDays: preview.durationDays,
      foodPaid: payment.paid,
      status: 'in-transit'
    };
    ensureState(state).settlerOrders.push(order);
    namespace.workforce.recalculateAll(state);
    return { ok: true, order, preview };
  }

  function dismantlePreview(state, outpostId, destinationId) {
    const outpost = outpostById(state, outpostId);
    const incoming = outpost ? activeOrdersForOutpost(state, outpost.id).filter((order) => order.destinationType === 'outpost') : [];
    if (incoming.length) return { allowed: false, reason: 'Dismantling is blocked while a settler group is incoming.', outpost, incoming };
    if (!outpost) return { allowed: false, reason: 'Outpost was not found.' };
    if (Number(outpost.population) <= 0) return { allowed: true, reason: 'Ready to dismantle the empty Outpost.', outpost, destination: null, amount: 0, food: foodPlan(state, 0, 0) };
    return relocationPreview(state, outpostId, destinationId, outpost.population);
  }

  function cancelAllOutpostProjects(state, region, options = {}) {
    const projects = namespace.constructionQueue.ensureQueue(region).projects.slice();
    for (const project of projects) {
      const result = namespace.constructionQueue.cancelProject(state, region, project.id, options);
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  function dismantleOutpost(state, outpostId, destinationId, options = {}) {
    const preview = dismantlePreview(state, outpostId, destinationId);
    if (!preview.allowed) return preview;
    let relocation = null;
    if (preview.amount > 0) {
      relocation = relocateResidents(state, outpostId, destinationId, preview.amount);
      if (!relocation.ok) return relocation;
    }
    const outpost = outpostById(state, outpostId);
    const region = outpost ? regionById(state, outpost.regionId) : null;
    if (!outpost || !region) return { ok: false, reason: 'Outpost was not found.' };
    const cancellation = cancelAllOutpostProjects(state, region, { confirmOverflow: Boolean(options.confirmOverflow) });
    if (!cancellation.ok) {
      if (relocation && relocation.order) {
        const order = relocation.order;
        order.status = 'cancelled';
        restorePeople(state, outpost, order.amount);
        refundFood(state, order.foodPaid);
      }
      return cancellation;
    }
    state.player.outposts = state.player.outposts.filter((item) => item !== outpost);
    region.resourceSites = [];
    region.resourceCapacityUsed = 0;
    region.waterCapacityUsed = 0;
    region.ownerId = null;
    region.controllerId = null;
    region.construction = namespace.models.createProvinceConstruction();
    if (namespace.uiRealm) namespace.uiRealm.refreshPlayerVisibility(state);
    namespace.workforce.recalculateAll(state);
    return { ok: true, outpost, region, relocation: relocation && relocation.order };
  }

  function arriveOrder(state, order) {
    const source = settlementById(state, order.sourceId);
    let destination = null;
    if (order.destinationType === 'outpost') {
      const outpost = outpostById(state, order.destinationId);
      destination = outpost;
      if (outpost) {
        outpost.population += order.amount;
        outpost.workforceTotal += order.amount;
      }
    } else {
      const settlement = settlementById(state, order.destinationId);
      destination = settlement;
      if (settlement && order.kind === 'internal-transfer') {
        settlement.population += order.amount;
        settlement.commoners = Math.max(0, Number(settlement.commoners) || 0) + order.amount;
        settlement.workforceTotal += order.workforceAmount;
      } else if (settlement) restorePeople(state, settlement, order.amount);
    }
    order.status = 'arrived';
    order.remainingDays = 0;
    if (order.kind === 'internal-transfer' && namespace.dailyEconomy) {
      namespace.dailyEconomy.createAlert(state, {
        type: 'population-transfer-arrival',
        title: 'Settlers Arrived',
        message: order.amount + ' settlers completed the journey from '
          + (source ? source.name : 'their source') + ' to ' + (destination ? destination.name : 'their destination') + '.',
        critical: false
      });
    }
  }

  function processDay(state) {
    const expansion = ensureState(state);
    refreshConversionBlocks(state);
    expansion.settlerOrders.forEach((order) => {
      if (order.status === 'departure-pending') order.status = 'in-transit';
      if (order.status !== 'in-transit') return;
      order.remainingDays = Math.max(0, Number(order.remainingDays) - 1);
      if (order.remainingDays <= EPSILON) arriveOrder(state, order);
    });
    namespace.workforce.recalculateAll(state);
    return {
      activeOrders: expansion.settlerOrders.filter((order) => ['departure-pending', 'in-transit'].includes(order.status)),
      arrivedOrders: expansion.settlerOrders.filter((order) => order.status === 'arrived')
    };
  }

  namespace.constructionProjectStartHandlers = namespace.constructionProjectStartHandlers || {};
  namespace.constructionProjectStartHandlers['outpost-founding'] = startFounding;
  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['outpost-founding'] = completeFounding;
  namespace.constructionProjectHandlers['outpost-conversion'] = completeConversion;
  namespace.constructionProjectCancellationHandlers = namespace.constructionProjectCancellationHandlers || {};
  namespace.constructionProjectCancellationHandlers['outpost-founding'] = cancelLifecycleProject;
  namespace.constructionProjectCancellationHandlers['outpost-conversion'] = cancelLifecycleProject;

  namespace.outpostLifecycle = Object.freeze({
    ensureState,
    regionById,
    outpostById,
    settlementById,
    landDistance,
    controlledBorderDistance,
    retainedPopulation,
    availableSettlers,
    foodRequirement,
    foodPlan,
    activeOrdersForOutpost,
    incomingSettlers,
    committedFoundingSettlers,
    foundingPreview,
    queueFounding,
    transferPreview,
    internalTransferPreview,
    sendInternalResidents,
    sendSettlers,
    cancelSettlerOrder,
    villageConversionPreview,
    townConversionPreview,
    queueConversion,
    relocationPreview,
    relocateResidents,
    internalTransferAvailability,
    dismantlePreview,
    dismantleOutpost,
    refreshConversionBlocks,
    processDay
  });
})(window.EcoRuler = window.EcoRuler || {});
