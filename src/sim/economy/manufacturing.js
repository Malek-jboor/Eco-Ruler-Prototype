(function initializeManufacturing(namespace) {
  const DAYS_PER_YEAR = 120;
  const EPSILON = 0.000001;

  function round(value, digits = 6) {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  }

  function canonicalBuildingId(buildingId) {
    return namespace.manufacturingData.buildingAliases[buildingId] || buildingId;
  }

  function definitionById(buildingId) {
    return namespace.manufacturingData.processingBuildings[canonicalBuildingId(buildingId)] || null;
  }

  function ensureCityState(city) {
    city.processingBuildings = Array.isArray(city.processingBuildings)
      ? city.processingBuildings
      : [];
    return city;
  }

  function cityById(state, cityId) {
    return (state.player.cities || []).find((city) => city.id === cityId) || null;
  }

  function cityAtSettlementRegion(state, regionId) {
    return (state.player.cities || []).find((city) => city.regionId === regionId) || null;
  }

  function settlementRegion(state, city) {
    return city
      ? namespace.resourceSites.regionById(state, city.regionId)
      : null;
  }

  function buildingById(city, buildingId) {
    ensureCityState(city);
    const canonicalId = canonicalBuildingId(buildingId);
    return city.processingBuildings.find((building) => canonicalBuildingId(building.buildingId) === canonicalId) || null;
  }

  function completedResearch(state) {
    const research = state.player && state.player.research;
    if (!research) return new Set();
    if (Array.isArray(research.completed)) return new Set(research.completed);
    if (research.completed && typeof research.completed === 'object') {
      return new Set(Object.keys(research.completed).filter((id) => research.completed[id]));
    }
    return new Set();
  }

  function recipeUnlocked() {
    return true;
  }

  function unlockedRecipes(state, definition) {
    return definition.recipes.filter((recipe) => recipeUnlocked(state, recipe));
  }

  function initialAllocations(state, definition) {
    const unlocked = unlockedRecipes(state, definition);
    const allocations = Object.fromEntries(definition.recipes.map((recipe) => [recipe.id, 0]));
    const outputIds = Array.from(new Set(unlocked.map((recipe) => recipe.outputId)));
    if (!outputIds.length) return allocations;

    let assigned = 0;
    outputIds.forEach((outputId, index) => {
      const route = unlocked.find((recipe) => recipe.outputId === outputId);
      const share = index === outputIds.length - 1
        ? round(100 - assigned, 1)
        : round(100 / outputIds.length, 1);
      allocations[route.id] = share;
      assigned = round(assigned + share, 1);
    });
    return allocations;
  }

  function allocationTotal(allocations) {
    return round(Object.values(allocations || {}).reduce((sum, value) => sum + Number(value || 0), 0), 1);
  }

  function normalizeAllocations(state, definition, requested) {
    const normalized = Object.fromEntries(definition.recipes.map((recipe) => [recipe.id, 0]));
    for (const recipe of definition.recipes) {
      const value = round(Math.max(0, Math.min(100, Number(requested && requested[recipe.id]) || 0)), 1);
      normalized[recipe.id] = value;
    }
    const total = allocationTotal(normalized);
    if (Math.abs(total - 100) > EPSILON) {
      return { ok: false, reason: 'Product allocations must total exactly 100.0%.', total, allocations: normalized };
    }
    return { ok: true, total, allocations: normalized };
  }

  function exactRequiredWorkers(state, building, allocations = building.allocations) {
    const definition = definitionById(building.buildingId);
    if (!definition || building.level <= 0) return 0;
    return definition.recipes.reduce((total, recipe) => {
      if (!recipeUnlocked(state, recipe)) return total;
      const share = Math.max(0, Number(allocations && allocations[recipe.id]) || 0) / 100;
      return total + (recipe.workers * share * building.level);
    }, 0);
  }

  function requiredWorkers(state, building, allocations = building.allocations) {
    return Math.ceil(exactRequiredWorkers(state, building, allocations) - EPSILON);
  }

  function requestAllocations(state, cityId, buildingId, requested) {
    const city = cityById(state, cityId);
    const building = city ? buildingById(city, buildingId) : null;
    const definition = definitionById(buildingId);
    if (!city || !building || !definition) {
      return { ok: false, reason: 'Processing building was not found.' };
    }
    const normalized = normalizeAllocations(state, definition, requested);
    if (!normalized.ok) return normalized;
    building.pendingAllocations = normalized.allocations;
    return { ok: true, building, allocations: normalized.allocations, total: normalized.total };
  }

  function requestWorkerCap(state, cityId, buildingId, requestedCap) {
    const city = cityById(state, cityId);
    const building = city ? buildingById(city, buildingId) : null;
    if (!building) return { ok: false, reason: 'Processing building was not found.' };
    const maximum = requiredWorkers(state, building, building.pendingAllocations || building.allocations);
    const cap = Math.max(0, Math.min(maximum, Math.floor(Number(requestedCap) || 0)));
    building.pendingWorkerCap = cap;
    return { ok: true, building, cap };
  }

  function applyPendingChanges(state) {
    (state.player.cities || []).forEach((city) => {
      ensureCityState(city);
      city.processingBuildings.forEach((building) => {
        const oldRequired = requiredWorkers(state, building);
        const oldCap = Math.max(0, Number(building.workerCap) || 0);
        if (building.pendingAllocations) {
          building.allocations = { ...building.pendingAllocations };
          building.pendingAllocations = null;
          const nextRequired = requiredWorkers(state, building);
          const previousRatio = oldRequired > 0 ? Math.min(1, oldCap / oldRequired) : 1;
          building.workerCap = Math.round(nextRequired * previousRatio);
        }
        if (Number.isFinite(building.pendingWorkerCap)) {
          building.workerCap = Math.min(requiredWorkers(state, building), Math.max(0, Math.floor(building.pendingWorkerCap)));
          building.pendingWorkerCap = null;
        }
      });
    });
  }

  function buildingProjects(region, cityId, buildingId) {
    if (!region) return [];
    return namespace.constructionQueue.ensureQueue(region).projects.filter((project) => (
      project.kind === 'processing-building-level'
      && project.cityId === cityId
      && project.buildingId === buildingId
      && ['active', 'waiting', 'paused'].includes(project.status)
    ));
  }

  function projectedLevel(state, city, buildingId) {
    const building = buildingById(city, buildingId);
    const region = settlementRegion(state, city);
    return (building ? building.level : 0) + buildingProjects(region, city.id, buildingId).length;
  }

  function constructionPreview(state, city, buildingId) {
    const definition = definitionById(buildingId);
    if (!definition || !city) return null;
    const currentLevel = projectedLevel(state, city, buildingId);
    const multiplier = currentLevel > 0
      ? namespace.economyData.expansionMultiplier(currentLevel)
      : 1;
    return {
      buildingId,
      label: definition.label,
      targetLevel: currentLevel + 1,
      multiplier,
      materials: namespace.economyData.materialCostFor(definition.construction, multiplier),
      cashPercent: definition.construction.cashPercent,
      cashAmount: null,
      days: Math.max(1, Math.ceil(definition.construction.days * Math.sqrt(multiplier)))
    };
  }

  function buildAvailability(state, regionId, buildingId) {
    if (!state.player.gameStarted) return { allowed: false, reason: 'Start the game first.' };
    const region = namespace.resourceSites.regionById(state, regionId);
    const city = cityAtSettlementRegion(state, regionId);
    const definition = definitionById(buildingId);
    if (!region || !city) {
      return { allowed: false, reason: 'Processing buildings require a Village, City, or Metropolis settlement province.' };
    }
    if (!definition) return { allowed: false, reason: 'Processing building definition was not found.' };
    const location = namespace.developmentEconomy.canBuildProcessing(city, buildingId);
    if (!location.allowed) return { ...location, region, city, definition };
    const capacity = namespace.developmentEconomy.canReserveDevelopment(state, city, buildingId);
    if (!capacity.allowed) {
      return { ...capacity, region, city, definition };
    }
    const preview = constructionPreview(state, city, buildingId);
    const shortages = namespace.resourceSites.materialShortages(state.storage, preview.materials);
    if (Object.keys(shortages).length) {
      return {
        allowed: false,
        reason: 'The central stockpile lacks required construction materials.',
        region,
        city,
        definition,
        preview,
        shortages
      };
    }
    return {
      allowed: true,
      reason: 'Ready to enter this settlement province construction queue.',
      region,
      city,
      definition,
      preview,
      shortages: {},
      capacity
    };
  }

  function queueLevel(state, regionId, buildingId) {
    const availability = buildAvailability(state, regionId, buildingId);
    if (!availability.allowed) return availability;
    return namespace.constructionQueue.queueProject(state, availability.region, {
      kind: 'processing-building-level',
      cityId: availability.city.id,
      buildingId,
      label: availability.definition.label,
      targetLevel: availability.preview.targetLevel,
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

  function completeProject(state, region, project) {
    const city = cityById(state, project.cityId) || cityAtSettlementRegion(state, region.id);
    const definition = definitionById(project.buildingId);
    if (!city || !definition) return null;
    ensureCityState(city);
    let building = buildingById(city, project.buildingId);
    if (!building) {
      state.nextProcessingBuildingOrder = Math.max(0, Number(state.nextProcessingBuildingOrder) || 0) + 1;
      building = {
        id: city.id + '-' + project.buildingId,
        buildingId: project.buildingId,
        level: 0,
        allocations: initialAllocations(state, definition),
        pendingAllocations: null,
        workerCap: 0,
        pendingWorkerCap: null,
        actualWorkers: 0,
        createdOrder: state.nextProcessingBuildingOrder,
        status: 'Idle',
        toolMultiplier: 1,
        technologyMultiplier: 1,
        maintenanceMultiplier: 1,
        maintenancePriority: 'normal',
        toolPriority: 'normal',
        toolMode: 'no-tools',
        assignedTools: { simple: 0, bronze: 0 },
        capacityDisabledLevels: 0,
        levelOrders: [],
        controllerModifier: 1,
        lastProduction: []
      };
      city.processingBuildings.push(building);
    }

    const previousRequired = requiredWorkers(state, building);
    const previousRatio = previousRequired > 0
      ? Math.min(1, Math.max(0, Number(building.workerCap) || 0) / previousRequired)
      : 1;
    building.level += 1;
    namespace.developmentEconomy.ensureState(state);
    building.workerCap = Math.round(requiredWorkers(state, building) * previousRatio);
    building.pendingWorkerCap = null;
    building.status = 'Unstaffed';
    return building;
  }

  function reducePreview(state, cityId, buildingId) {
    const city = cityById(state, cityId);
    const region = settlementRegion(state, city);
    if (!city || !region) return { allowed: false, reason: 'Settlement was not found.' };
    const projects = buildingProjects(region, cityId, buildingId);
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
        refund: namespace.constructionQueue.refundQuantities(project),
        reason: 'Cancels the newest expansion and refunds its unfinished share.'
      };
    }
    const building = buildingById(city, buildingId);
    if (!building || building.level <= 0) {
      return { allowed: false, reason: 'The building is already at Level 0.', refund: 0 };
    }
    return {
      allowed: true,
      action: 'reduce-completed',
      building,
      targetLevel: building.level - 1,
      workersReleased: Math.max(0, requiredWorkers(state, building) - requiredWorkers(state, { ...building, level: building.level - 1 })),
      refund: 0,
      reason: 'Removes one completed level immediately. No materials or cash are refunded.'
    };
  }

  function reduceLevel(state, cityId, buildingId, options = {}) {
    const preview = reducePreview(state, cityId, buildingId);
    if (!preview.allowed) return preview;
    const city = cityById(state, cityId);
    const region = settlementRegion(state, city);
    if (preview.project) {
      const result = namespace.constructionQueue.cancelProject(state, region, preview.project.id, { confirmOverflow: Boolean(options.confirmOverflow) });
      if (namespace.workforce) namespace.workforce.recalculateAll(state);
      return { ...preview, ...result };
    }

    const building = preview.building;
    const oldRequired = requiredWorkers(state, building);
    const oldRatio = oldRequired > 0 ? Math.min(1, building.workerCap / oldRequired) : 1;
    building.level -= 1;
    if (Array.isArray(building.levelOrders)) building.levelOrders.pop();
    building.workerCap = Math.round(requiredWorkers(state, building) * oldRatio);
    building.pendingWorkerCap = null;
    if (building.level <= 0) {
      city.processingBuildings = city.processingBuildings.filter((item) => item !== building);
    }
    if (namespace.developmentEconomy) namespace.developmentEconomy.reconcileAll(state);
    if (namespace.workforce) namespace.workforce.recalculateAll(state);
    return { ok: true, ...preview, building };
  }

  function allBuildings(state) {
    return (state.player.cities || []).flatMap((city) => {
      ensureCityState(city);
      return city.processingBuildings.map((building) => ({ city, building }));
    }).sort((first, second) => (
      first.building.createdOrder - second.building.createdOrder
      || first.building.id.localeCompare(second.building.id)
    ));
  }

  function multiplier(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 1;
  }

  function collectLines(state) {
    const lines = [];
    allBuildings(state).forEach(({ city, building }) => {
      const definition = definitionById(building.buildingId);
      const required = requiredWorkers(state, building);
      const staffingRatio = required > 0
        ? Math.min(1, Math.max(0, Number(building.actualWorkers) || 0) / required)
        : 0;
      const effectiveLevels = namespace.developmentEconomy
        ? namespace.developmentEconomy.activeLevels(building)
        : building.level;
      const commonMultiplier = multiplier(building.toolMultiplier)
        * multiplier(building.technologyMultiplier)
        * multiplier(building.maintenanceMultiplier);
      const collectionModifier = multiplier(building.controllerModifier);

      definition.recipes.forEach((recipe) => {
        if (!recipeUnlocked(state, recipe)) return;
        const allocation = Math.max(0, Number(building.allocations && building.allocations[recipe.id]) || 0) / 100;
        if (allocation <= 0 || staffingRatio <= 0 || effectiveLevels <= 0) return;
        const desiredOutputBeforeCap = recipe.annualOutput / DAYS_PER_YEAR
          * effectiveLevels
          * staffingRatio
          * allocation
          * commonMultiplier;
        const cap = namespace.storageLedger.productCapAvailability(state.storage, recipe.outputId);
        const desiredOutput = cap.stopped ? 0 : desiredOutputBeforeCap;
        const inputDemand = Object.fromEntries(Object.entries(recipe.inputs).map(([resourceId, amount]) => [
          resourceId,
          desiredOutput * amount
        ]));
        lines.push({
          id: building.id + ':' + recipe.id,
          city,
          building,
          definition,
          recipe,
          allocation,
          staffingRatio,
          effectiveWorkers: (Number(building.actualWorkers) || 0) * allocation,
          desiredOutput,
          desiredOutputBeforeCap,
          capStopped: cap.stopped,
          capMin: cap.min,
          capMax: cap.max,
          collectionModifier,
          inputDemand
        });
      });
    });
    return lines;
  }

  function sumByResource(lines, key) {
    return lines.reduce((totals, line) => {
      Object.entries(line[key] || {}).forEach(([resourceId, amount]) => {
        totals[resourceId] = (totals[resourceId] || 0) + Number(amount || 0);
      });
      return totals;
    }, {});
  }

  function exactStoragePoints(values = {}) {
    return Object.entries(values).reduce((total, [resourceId, amount]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      if (!item) throw new Error('Unknown storage item: ' + resourceId);
      return total + (Number(amount) || 0) * item.coefficient;
    }, 0);
  }

  function planDay(state) {
    const beginningStock = { ...(state.storage.available || {}) };
    const lines = collectLines(state);
    const totalDemand = sumByResource(lines, 'inputDemand');
    const inputRatios = Object.fromEntries(Object.entries(totalDemand).map(([resourceId, demand]) => [
      resourceId,
      demand > 0 ? Math.min(1, Math.max(0, Number(beginningStock[resourceId]) || 0) / demand) : 1
    ]));

    lines.forEach((line) => {
      const ratios = Object.keys(line.inputDemand).map((resourceId) => inputRatios[resourceId] ?? 1);
      line.inputFulfillment = ratios.length ? Math.min(...ratios) : 1;
      line.grossOutputBeforeCollection = line.desiredOutput * line.inputFulfillment;
      line.outputBeforeStorage = line.grossOutputBeforeCollection * line.collectionModifier;
      line.collectionLostBeforeStorage = line.grossOutputBeforeCollection - line.outputBeforeStorage;
      line.inputsBeforeStorage = Object.fromEntries(Object.entries(line.inputDemand).map(([resourceId, amount]) => [
        resourceId,
        amount * line.inputFulfillment
      ]));
    });

    const outputBeforeCap = lines.reduce((totals, line) => {
      totals[line.recipe.outputId] = (totals[line.recipe.outputId] || 0) + line.outputBeforeStorage;
      return totals;
    }, {});
    const capRatios = Object.fromEntries(Object.entries(outputBeforeCap).map(([resourceId, amount]) => {
      const availability = namespace.storageLedger.productCapAvailability(state.storage, resourceId);
      return [resourceId, availability.stopped || amount <= 0 ? (availability.stopped ? 0 : 1) : Math.min(1, availability.remaining / amount)];
    }));
    lines.forEach((line) => {
      line.capFulfillment = capRatios[line.recipe.outputId] ?? 1;
      line.outputBeforeStorage *= line.capFulfillment;
      line.collectionLostBeforeStorage *= line.capFulfillment;
      line.inputsBeforeStorage = Object.fromEntries(Object.entries(line.inputsBeforeStorage).map(([resourceId, amount]) => [
        resourceId,
        amount * line.capFulfillment
      ]));
    });
    const outputBeforeStorage = lines.reduce((totals, line) => {
      totals[line.recipe.outputId] = (totals[line.recipe.outputId] || 0) + line.outputBeforeStorage;
      return totals;
    }, {});
    const inputsBeforeStorage = sumByResource(lines, 'inputsBeforeStorage');
    const outputPoints = exactStoragePoints(outputBeforeStorage);
    const inputPoints = exactStoragePoints(inputsBeforeStorage);
    const netAdditionalPoints = Math.max(0, outputPoints - inputPoints);
    const freePoints = namespace.storageLedger.storageSummary(state.storage).free;
    const storageRatio = netAdditionalPoints > 0
      ? Math.min(1, freePoints / netAdditionalPoints)
      : 1;

    const consumed = {};
    const produced = {};
    lines.forEach((line) => {
      line.storageFulfillment = storageRatio;
      line.actualOutput = line.outputBeforeStorage * storageRatio;
      line.collectionLost = line.collectionLostBeforeStorage * storageRatio;
      line.actualInputs = Object.fromEntries(Object.entries(line.inputsBeforeStorage).map(([resourceId, amount]) => [
        resourceId,
        amount * storageRatio
      ]));
      Object.entries(line.actualInputs).forEach(([resourceId, amount]) => {
        consumed[resourceId] = (consumed[resourceId] || 0) + amount;
      });
      produced[line.recipe.outputId] = (produced[line.recipe.outputId] || 0) + line.actualOutput;
    });

    return {
      beginningStock,
      lines,
      totalDemand,
      inputRatios,
      capRatios,
      consumed: Object.fromEntries(Object.entries(consumed).map(([id, amount]) => [id, round(amount)])),
      produced: Object.fromEntries(Object.entries(produced).map(([id, amount]) => [id, round(amount)])),
      storageRatio,
      outputPoints,
      inputPoints,
      netAdditionalPoints,
      freePoints
    };
  }

  function resolveEpisode(state, key) {
    const economy = namespace.dailyEconomy.ensureEconomyState(state);
    const episode = economy[key];
    if (!episode) return;
    const alert = namespace.dailyEconomy.alertById(state, episode.alertId);
    if (alert) {
      alert.active = false;
      alert.resolved = true;
    }
    economy[key] = null;
  }

  function updateShortageAlert(state, plan) {
    const economy = namespace.dailyEconomy.ensureEconomyState(state);
    const missingIds = Object.entries(plan.inputRatios)
      .filter(([, ratio]) => ratio < 1 - EPSILON)
      .map(([resourceId]) => resourceId);
    if (!missingIds.length) {
      resolveEpisode(state, 'manufacturingShortageEpisode');
      return null;
    }

    const labels = missingIds.map((resourceId) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      return item ? item.label : resourceId;
    });
    let alert = economy.manufacturingShortageEpisode
      ? namespace.dailyEconomy.alertById(state, economy.manufacturingShortageEpisode.alertId)
      : null;
    if (!alert) {
      alert = namespace.dailyEconomy.createAlert(state, {
        type: 'manufacturing-input-shortage',
        title: 'Production Input Shortage',
        message: labels.join(', '),
        details: missingIds.map((resourceId) => ({
          resourceId,
          required: round(plan.totalDemand[resourceId]),
          available: round(plan.beginningStock[resourceId] || 0)
        })),
        critical: false
      });
      economy.manufacturingShortageEpisode = { alertId: alert.id };
    } else {
      alert.message = labels.join(', ');
      alert.details = missingIds.map((resourceId) => ({
        resourceId,
        required: round(plan.totalDemand[resourceId]),
        available: round(plan.beginningStock[resourceId] || 0)
      }));
    }
    return alert;
  }

  function updateStorageAlert(state, plan) {
    if (plan.storageRatio >= 1 - EPSILON) {
      resolveEpisode(state, 'manufacturingStorageEpisode');
      return null;
    }
    const economy = namespace.dailyEconomy.ensureEconomyState(state);
    let alert = economy.manufacturingStorageEpisode
      ? namespace.dailyEconomy.alertById(state, economy.manufacturingStorageEpisode.alertId)
      : null;
    if (!alert) {
      alert = namespace.dailyEconomy.createAlert(state, {
        type: 'manufacturing-storage-full',
        title: 'Manufacturing Storage Blocked',
        message: 'Some workshop production stopped because Central Storage is full.',
        critical: false
      });
      economy.manufacturingStorageEpisode = { alertId: alert.id };
    }
    return alert;
  }

  function processDay(state) {
    const plan = planDay(state);
    if (Object.keys(plan.consumed).length) {
      namespace.storageLedger.addQuantities(state.storage.available, plan.consumed, -1);
      namespace.storageLedger.recordTransaction(state.storage, 'manufacturing-inputs-consumed', plan.consumed);
    }
    if (Object.keys(plan.produced).length) {
      namespace.storageLedger.addQuantities(state.storage.available, plan.produced);
      namespace.storageLedger.recordTransaction(state.storage, 'manufacturing-production', plan.produced);
    }

    const byBuilding = new Map();
    plan.lines.forEach((line) => {
      if (!byBuilding.has(line.building.id)) byBuilding.set(line.building.id, []);
      byBuilding.get(line.building.id).push({
        recipeId: line.recipe.id,
        outputId: line.recipe.outputId,
        allocation: line.allocation * 100,
        effectiveWorkers: line.effectiveWorkers,
        inputFulfillment: line.inputFulfillment,
        capFulfillment: line.capFulfillment,
        stoppedByMaxCap: line.capStopped || line.capFulfillment < 1 - EPSILON,
        storageFulfillment: line.storageFulfillment,
        output: line.actualOutput,
        grossOutput: line.actualOutput + line.collectionLost,
        collectionCoverage: line.collectionModifier,
        collectionLost: line.collectionLost,
        inputs: line.actualInputs
      });
    });

    allBuildings(state).forEach(({ building }) => {
      const required = requiredWorkers(state, building);
      const results = byBuilding.get(building.id) || [];
      building.lastProduction = results;
      if (namespace.developmentEconomy && namespace.developmentEconomy.activeLevels(building) <= 0) building.status = 'Capacity Disabled';
      else if (building.actualWorkers <= 0) building.status = 'Unstaffed';
      else if (results.length && results.every((line) => line.stoppedByMaxCap)) building.status = 'Max Cap';
      else if (results.some((line) => line.inputFulfillment < 1 - EPSILON)) building.status = 'Input Shortage';
      else if (results.some((line) => line.storageFulfillment < 1 - EPSILON)) building.status = 'Storage Full';
      else if (building.actualWorkers < required) building.status = 'Understaffed';
      else building.status = 'Active';
    });

    updateShortageAlert(state, plan);
    updateStorageAlert(state, plan);
    return plan;
  }

  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['processing-building-level'] = completeProject;

  namespace.manufacturing = Object.freeze({
    DAYS_PER_YEAR,
    canonicalBuildingId,
    definitionById,
    ensureCityState,
    cityById,
    cityAtSettlementRegion,
    settlementRegion,
    buildingById,
    completedResearch,
    recipeUnlocked,
    unlockedRecipes,
    initialAllocations,
    allocationTotal,
    normalizeAllocations,
    exactRequiredWorkers,
    requiredWorkers,
    requestAllocations,
    requestWorkerCap,
    applyPendingChanges,
    buildingProjects,
    projectedLevel,
    constructionPreview,
    buildAvailability,
    queueLevel,
    completeProject,
    reducePreview,
    reduceLevel,
    allBuildings,
    collectLines,
    planDay,
    processDay
  });
})(window.EcoRuler = window.EcoRuler || {});
