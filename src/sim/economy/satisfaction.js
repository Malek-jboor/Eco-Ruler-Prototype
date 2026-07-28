(function initializeSatisfaction(namespace) {
  const EPSILON = 0.000001;
  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const round = (value, digits = 4) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  };

  function cities(state) {
    return state.player && Array.isArray(state.player.cities) ? state.player.cities : [];
  }

  function ensureService(city, id) {
    const definition = namespace.satisfactionData.serviceDefinitions[id];
    city.satisfactionServices = city.satisfactionServices || {};
    const service = city.satisfactionServices[id] || (city.satisfactionServices[id] = {});
    const required = Math.ceil(Math.max(0, Number(city.population) || 0) / definition.populationPerWorker);
    const firstSetup = !service.stateVersion;
    service.stateVersion = 1;
    service.id = `${city.id}-${id}`;
    service.buildingId = id;
    service.serviceId = id;
    service.level = 1;
    service.capacityDisabledLevels = 0;
    service.requiredWorkers = required;
    service.tracksFullRequirement = firstSetup ? true : service.tracksFullRequirement !== false;
    if (firstSetup || service.tracksFullRequirement) service.workerCap = required;
    else service.workerCap = clamp(service.workerCap, 0, required);
    if (service.pendingWorkerCap != null) service.pendingWorkerCap = clamp(service.pendingWorkerCap, 0, required);
    service.actualWorkers = clamp(service.actualWorkers, 0, required);
    service.status = service.actualWorkers + EPSILON >= service.workerCap ? 'Active' : 'Understaffed';
    return service;
  }

  function ensureSettlement(city) {
    if (!city || city.settlementIdentity === 'outpost') return city;
    const firstSetup = Number(city.satisfactionStateVersion) !== 1;
    city.satisfactionStateVersion = 1;
    city.satisfaction = firstSetup
      ? namespace.satisfactionData.INITIAL_SATISFACTION
      : clamp(city.satisfaction, 0, 100);
    city.livingStandards = city.livingStandards || {};
    city.livingStandards.mealCount = clamp(Math.round(city.livingStandards.mealCount || 1), 1, 3);
    city.livingStandards.drinkLevel = namespace.satisfactionData.drinkLevels[city.livingStandards.drinkLevel]
      ? city.livingStandards.drinkLevel : 'none';
    ensureService(city, 'local-watch');
    ensureService(city, 'religious-services');
    city.satisfactionShortageEpisode = city.satisfactionShortageEpisode || null;
    return city;
  }

  function ensureState(state) {
    state.economy = state.economy || {};
    state.economy.satisfaction = state.economy.satisfaction || { stateVersion: 1, lastDay: null };
    cities(state).forEach(ensureSettlement);
    return state.economy.satisfaction;
  }

  function cityById(state, cityId) {
    return cities(state).find((city) => city.id === cityId) || null;
  }

  function requestMealCount(state, cityId, mealCount) {
    const city = cityById(state, cityId);
    const value = Math.round(Number(mealCount));
    if (!city || value < 1 || value > 3) return { ok: false, reason: 'Meal count must be between 1 and 3.' };
    ensureSettlement(city).livingStandards.pendingMealCount = value;
    return { ok: true, value, applies: 'next-daily-tick' };
  }

  function requestDrinkLevel(state, cityId, levelId) {
    const city = cityById(state, cityId);
    if (!city || !namespace.satisfactionData.drinkLevels[levelId]) return { ok: false, reason: 'Unknown drink level.' };
    ensureSettlement(city).livingStandards.pendingDrinkLevel = levelId;
    return { ok: true, value: levelId, applies: 'next-daily-tick' };
  }

  function requestServiceCap(state, cityId, serviceId, value) {
    const city = cityById(state, cityId);
    const definition = namespace.satisfactionData.serviceDefinitions[serviceId];
    if (!city || !definition) return { ok: false, reason: 'Settlement service was not found.' };
    const service = ensureService(city, serviceId);
    const cap = Math.floor(Number(value));
    if (!Number.isFinite(cap) || cap < 0 || cap > service.requiredWorkers) {
      return { ok: false, reason: `Worker cap must be from 0 to ${service.requiredWorkers}.` };
    }
    service.pendingWorkerCap = cap;
    return { ok: true, value: cap, applies: 'next-daily-tick' };
  }

  function applyPending(state) {
    ensureState(state);
    cities(state).forEach((city) => {
      const standards = city.livingStandards;
      if (standards.pendingMealCount != null) standards.mealCount = standards.pendingMealCount;
      if (standards.pendingDrinkLevel != null) standards.drinkLevel = standards.pendingDrinkLevel;
      standards.pendingMealCount = null;
      standards.pendingDrinkLevel = null;
      Object.keys(namespace.satisfactionData.serviceDefinitions).forEach((id) => {
        const service = ensureService(city, id);
        if (service.pendingWorkerCap != null) {
          service.workerCap = service.pendingWorkerCap;
          service.tracksFullRequirement = service.workerCap === service.requiredWorkers;
          service.pendingWorkerCap = null;
        }
      });
    });
  }

  function consumers(state) {
    const result = cities(state).map((city) => ({
      id: city.id,
      city,
      population: Math.max(0, Number(city.population) || 0),
      mealCount: city.livingStandards.mealCount,
      drinkLevel: city.livingStandards.drinkLevel,
      scored: true
    }));
    (state.player.outposts || []).forEach((outpost) => result.push({
      id: outpost.id,
      city: outpost,
      population: Math.max(0, Number(outpost.population) || 0),
      mealCount: 1,
      drinkLevel: 'none',
      scored: false
    }));
    return result;
  }

  function available(stock, resourceIds) {
    return resourceIds.reduce((sum, id) => sum + Math.max(0, Number(stock[id]) || 0), 0);
  }

  function consumeOrdered(ledger, resourceIds, amount, type) {
    let remaining = Math.max(0, Number(amount) || 0);
    const quantities = {};
    resourceIds.forEach((id) => {
      const taken = Math.min(remaining, Math.max(0, Number(ledger.available[id]) || 0));
      if (taken > EPSILON) {
        quantities[id] = round(taken);
        remaining -= taken;
      }
    });
    if (Object.keys(quantities).length) namespace.storageLedger.addQuantities(ledger.available, quantities, -1);
    namespace.storageLedger.recordTransaction(ledger, type, quantities, {
      requiredAmount: round(amount),
      missingAmount: round(Math.max(0, remaining))
    });
    return { required: round(amount), consumed: round(amount - remaining), missing: round(remaining), quantities };
  }

  function takeFromPreview(stock, resourceIds, amount) {
    let remaining = Math.max(0, Number(amount) || 0);
    resourceIds.forEach((id) => {
      const taken = Math.min(remaining, Math.max(0, Number(stock[id]) || 0));
      stock[id] = Math.max(0, (Number(stock[id]) || 0) - taken);
      remaining -= taken;
    });
  }

  function distributeLayer(ledger, rows, definition, layer, mutate) {
    const eligible = rows.filter((row) => row.mealCount >= layer && row.population > 0);
    const requiredTotal = eligible.reduce((sum, row) => sum + row.population * namespace.satisfactionData.FOOD_PER_MEAL_PER_PERSON * definition.share, 0);
    const stock = mutate ? ledger.available : ledger;
    const availableTotal = available(stock, definition.resources);
    const coverage = requiredTotal > EPSILON ? Math.min(1, availableTotal / requiredTotal) : 1;
    if (mutate && requiredTotal > EPSILON) {
      if (definition.resources.length === 1) namespace.storageLedger.consume(ledger, definition.resources[0], requiredTotal, 'civilian-food-consumed');
      else namespace.storageLedger.consumeGroup(ledger, definition.resources, requiredTotal, 'civilian-food-consumed');
    } else if (!mutate) takeFromPreview(stock, definition.resources, requiredTotal * coverage);
    eligible.forEach((row) => {
      row.food.layers[layer - 1].categories[definition.id] = {
        required: round(row.population * namespace.satisfactionData.FOOD_PER_MEAL_PER_PERSON * definition.share),
        coverage: round(coverage)
      };
    });
    return { layer, category: definition.id, required: round(requiredTotal), available: round(availableTotal), coverage: round(coverage) };
  }

  function distributeFood(state, rows, mutate) {
    rows.forEach((row) => {
      row.food = { layers: [1, 2, 3].map((layer) => ({ layer, categories: {} })), reserveDays: 0, reserveFactor: 0.8 };
    });
    const ledger = mutate ? state.storage : { ...(state.storage.available || {}) };
    const totals = [];
    [1, 2, 3].forEach((layer) => namespace.satisfactionData.foodCategories.forEach((definition) => {
      totals.push(distributeLayer(ledger, rows, definition, layer, mutate));
    }));
    rows.forEach((row) => row.food.layers.forEach((layer) => {
      const categories = namespace.satisfactionData.foodCategories.map((definition) => layer.categories[definition.id]);
      layer.coverage = round(namespace.satisfactionData.foodCategories.reduce((sum, definition) => (
        sum + (layer.categories[definition.id] ? layer.categories[definition.id].coverage : 0) * definition.share
      ), 0));
      layer.categoryCount = categories.filter((entry) => entry && entry.coverage + EPSILON >= 0.75).length;
    }));
    return { totals, remainingStock: mutate ? state.storage.available : ledger };
  }

  function distributeSimplePool(state, rows, options, mutate) {
    const eligible = rows.filter((row) => options.rate(row) > EPSILON && row.population > 0);
    const required = eligible.reduce((sum, row) => sum + row.population * options.rate(row), 0);
    const stock = mutate ? state.storage.available : options.stock;
    const availableTotal = available(stock, options.resources);
    const coverage = required > EPSILON ? Math.min(1, availableTotal / required) : 1;
    let consumed = 0;
    if (mutate && required > EPSILON) {
      const result = options.ordered
        ? consumeOrdered(state.storage, options.resources, required, options.transactionType)
        : namespace.storageLedger.consumeGroup(state.storage, options.resources, required, options.transactionType);
      consumed = options.ordered ? result.consumed : result.consumedTotal;
    } else consumed = Math.min(required, availableTotal);
    eligible.forEach((row) => {
      row[options.key] = {
        required: round(row.population * options.rate(row)),
        coverage: round(coverage),
        consumed: round(row.population * options.rate(row) * coverage)
      };
    });
    rows.filter((row) => !row[options.key]).forEach((row) => { row[options.key] = { required: 0, coverage: 1, consumed: 0 }; });
    return { required: round(required), available: round(availableTotal), coverage: round(coverage), consumed: round(consumed) };
  }

  function reserveDays(state, rows) {
    const stock = state.storage.available || {};
    let least = namespace.satisfactionData.RESERVE_DAYS_CAP;
    namespace.satisfactionData.foodCategories.forEach((definition) => {
      const daily = rows.reduce((sum, row) => sum + row.population * row.mealCount
        * namespace.satisfactionData.FOOD_PER_MEAL_PER_PERSON * definition.share, 0);
      if (daily <= EPSILON) return;
      const remaining = Object.fromEntries(definition.resources.map((id) => [id, Math.max(0, Number(stock[id]) || 0)]));
      let covered = 0;
      for (let day = 1; day <= namespace.satisfactionData.RESERVE_DAYS_CAP; day += 1) {
        const total = available(remaining, definition.resources);
        if (total + EPSILON < daily) break;
        definition.resources.forEach((id) => {
          const taken = total > EPSILON ? daily * remaining[id] / total : 0;
          remaining[id] = Math.max(0, remaining[id] - taken);
        });
        definition.resources.forEach((id) => {
          const annualLoss = namespace.dailyEconomy ? namespace.dailyEconomy.spoilageRate(id) : 0;
          remaining[id] *= (1 - annualLoss) ** (1 / 120);
        });
        covered = day;
      }
      least = Math.min(least, covered);
    });
    return least;
  }
  function plannedDailyDemand(state) {
    ensureState(state);
    const rows = consumers(state);
    const demand = {};
    namespace.satisfactionData.foodCategories.forEach((definition) => {
      const total = rows.reduce((sum, row) => sum + row.population * row.mealCount * namespace.satisfactionData.FOOD_PER_MEAL_PER_PERSON * definition.share, 0);
      const stockTotal = available(state.storage.available || {}, definition.resources);
      definition.resources.forEach((resourceId) => {
        const share = stockTotal > EPSILON
          ? Math.max(0, Number(state.storage.available[resourceId]) || 0) / stockTotal
          : 1 / definition.resources.length;
        demand[resourceId] = round(total * share);
      });
    });
    const clothingTotal = rows.reduce((sum, row) => sum + row.population * namespace.satisfactionData.CLOTHING_PER_PERSON, 0);
    const clothingStock = available(state.storage.available || {}, namespace.satisfactionData.clothingResources);
    namespace.satisfactionData.clothingResources.forEach((resourceId) => {
      demand[resourceId] = round(clothingTotal * (clothingStock > EPSILON
        ? Math.max(0, Number(state.storage.available[resourceId]) || 0) / clothingStock : 1 / 3));
    });
    let drinkDemand = rows.reduce((sum, row) => sum + row.population * namespace.satisfactionData.drinkLevels[row.drinkLevel].dailyPerPerson, 0);
    namespace.satisfactionData.drinkResources.forEach((resourceId) => {
      const amount = Math.min(drinkDemand, Math.max(0, Number(state.storage.available[resourceId]) || 0));
      demand[resourceId] = round(amount);
      drinkDemand -= amount;
    });
    if (drinkDemand > EPSILON) demand.liquor = round((demand.liquor || 0) + drinkDemand);
    return demand;
  }
  function livingStandards(state, mutate = false) {
    ensureState(state);
    const rows = consumers(state);
    const foodPlan = distributeFood(state, rows, mutate);
    const foodTotals = foodPlan.totals;
    const afterFood = mutate ? null : foodPlan.remainingStock;
    const clothing = distributeSimplePool(state, rows, {
      key: 'clothing', resources: namespace.satisfactionData.clothingResources,
      rate: () => namespace.satisfactionData.CLOTHING_PER_PERSON,
      transactionType: 'civilian-clothes-consumed', stock: afterFood
    }, mutate);
    const drinkStock = mutate ? null : { ...afterFood };
    if (!mutate) takeFromPreview(drinkStock, namespace.satisfactionData.clothingResources, clothing.consumed);
    const drinks = distributeSimplePool(state, rows, {
      key: 'drinks', resources: namespace.satisfactionData.drinkResources,
      rate: (row) => namespace.satisfactionData.drinkLevels[row.drinkLevel].dailyPerPerson,
      transactionType: 'civilian-drinks-consumed', ordered: true, stock: drinkStock
    }, mutate);
    const days = reserveDays(state, rows);
    const factor = 0.8 + 0.2 * clamp(days / namespace.satisfactionData.RESERVE_DAYS_CAP);
    rows.forEach((row) => { row.food.reserveDays = days; row.food.reserveFactor = factor; });
    const criticalRows = rows.filter((row) => namespace.satisfactionData.foodCategories.some((definition) => {
      const entry = row.food.layers[0].categories[definition.id];
      return entry && entry.required > EPSILON && entry.coverage <= EPSILON;
    }));
    return { rows, foodTotals, clothing, drinks, reserveDays: days, reserveFactor: factor, criticalRows };
  }

  function activeEmployment(state, city) {
    const entries = namespace.workforcePriority ? namespace.workforcePriority.cityEntries(state, city) : [];
    const employed = entries.reduce((sum, entry) => {
      const actual = Math.max(0, Number(entry.target.actualWorkers) || 0);
      if (!entry.target.capacityDisabledLevels || entry.kind === 'service') return sum + actual;
      const levels = Math.max(1, Number(entry.target.level) || 1);
      const required = namespace.workforcePriority.requestedWorkers(state, entry).required;
      const retained = Math.min(actual, required * Math.min(levels, Number(entry.target.capacityDisabledLevels) || 0) / levels);
      return sum + Math.max(0, actual - retained);
    }, 0);
    const total = Math.max(0, Number(city.workforceTotal) || 0);
    return { employed: round(employed), total, coverage: total > EPSILON ? clamp(employed / total) : 1 };
  }

  function excessScore(capacity, obligations) {
    const required = Math.max(0, Number(obligations) || 0);
    if (required <= EPSILON) return 2.5;
    const excess = Math.max(0, Number(capacity) - required);
    return 2.5 * clamp(excess / (required * 0.25));
  }

  function adminScores(state, city) {
    const administration = namespace.administration ? namespace.administration.reconcile(state) : state.administration;
    if (!administration || !administration.country) return { country: 2.5, local: 2.5 };
    const countryObligations = Object.values(administration.country.branches || {}).reduce((sum, row) => sum + Number(row.demand && row.demand.total || 0), 0)
      + Number(administration.country.reserved || 0);
    const country = excessScore(administration.country.capacity, countryObligations);
    const center = city.settlementIdentity === 'village'
      ? (namespace.settlementHierarchy.parentTown(state, city) || city) : city;
    const localRow = administration.localByCenter && administration.localByCenter[center.id];
    const localObligations = localRow ? Number(localRow.demand || 0) + Number(localRow.reserved || 0) : 0;
    return { country, local: localRow ? excessScore(localRow.capacity, localObligations) : 2.5 };
  }

  function scoreSettlement(state, city, row) {
    const first = row.food.layers[0];
    const second = row.food.layers[1];
    const third = row.food.layers[2];
    const baseMeal = first.coverage * 18 + (row.mealCount >= 2 ? second.coverage * 4 : 0) + (row.mealCount >= 3 ? third.coverage * 3 : 0);
    const variety = first.categoryCount <= 1 ? 0 : first.categoryCount === 2 ? 1.5 : first.categoryCount === 3 ? 3 : 5;
    const foodMeal = baseMeal * row.food.reserveFactor;
    const foodVariety = variety * row.food.reserveFactor;
    const housing = namespace.developmentEconomy ? namespace.developmentEconomy.housingSummary(city).satisfactionPotential : 15;
    const employment = activeEmployment(state, city);
    const watch = ensureService(city, 'local-watch');
    const religion = ensureService(city, 'religious-services');
    const admin = adminScores(state, city);
    const drinkDefinition = namespace.satisfactionData.drinkLevels[city.livingStandards.drinkLevel];
    const components = {
      firstMeal: round(first.coverage * 18 * row.food.reserveFactor),
      housing: round(housing),
      basicClothing: round(row.clothing.coverage * 10),
      security: round(10 * (watch.requiredWorkers > 0 ? clamp(watch.actualWorkers / watch.requiredWorkers) : 1)),
      employment: round(5 * employment.coverage),
      warPeace: 2,
      extraMeals: round(((row.mealCount >= 2 ? second.coverage * 4 : 0) + (row.mealCount >= 3 ? third.coverage * 3 : 0)) * row.food.reserveFactor),
      foodVariety: round(foodVariety),
      drinks: round(drinkDefinition.points * row.drinks.coverage),
      betterClothing: 5,
      religion: round(7 * (religion.requiredWorkers > 0 ? clamp(religion.actualWorkers / religion.requiredWorkers) : 1)),
      militaryPower: 5,
      countryExcess: round(admin.country),
      localExcess: round(admin.local)
    };
    const needs = components.firstMeal + components.housing + components.basicClothing + components.security + components.employment + components.warPeace;
    const wants = components.extraMeals + components.foodVariety + components.drinks + components.betterClothing + components.religion + components.militaryPower + components.countryExcess + components.localExcess;
    const penalty = city.satisfactionPenalty ? Number(city.satisfactionPenalty.amount) || 0 : 0;
    const target = clamp(needs + wants + penalty, 0, 100);
    const actual = clamp(city.satisfaction, 0, 100);
    const movement = target > actual + EPSILON ? Math.min(namespace.satisfactionData.DAILY_INCREASE, target - actual)
      : target < actual - EPSILON ? -Math.min(namespace.satisfactionData.DAILY_DECREASE, actual - target) : 0;
    const projection30 = movement >= 0
      ? Math.min(target, actual + namespace.satisfactionData.DAILY_INCREASE * 30)
      : Math.max(target, actual - namespace.satisfactionData.DAILY_DECREASE * 30);
    return { cityId: city.id, actual: round(actual, 1), target: round(target, 1), movement, nextDay: round(actual + movement, 1), projection30: round(projection30, 1), needs: round(needs), wants: round(wants), penalty, components, row, employment };
  }

  function updateShortageAlert(state, city, result) {
    const shortages = [];
    if (result.row.food.layers.some((layer, index) => index < result.row.mealCount && layer.coverage < 1 - EPSILON)) shortages.push('Food');
    if (result.row.clothing.coverage < 1 - EPSILON) shortages.push('Clothing');
    if (result.row.drinks.required > 0 && result.row.drinks.coverage < 1 - EPSILON) shortages.push('Drinks');
    if (result.components.housing < 15 - EPSILON) shortages.push('Housing');
    if (result.components.employment < 5 - EPSILON) shortages.push('Employment');
    if (result.components.security < 10 - EPSILON) shortages.push('Local Watch');
    if (result.components.religion < 7 - EPSILON) shortages.push('Religious Services');
    if (result.components.countryExcess + result.components.localExcess < 5 - EPSILON) shortages.push('Administrative Control');
    const existing = city.satisfactionShortageEpisode;
    if (!shortages.length) {
      if (existing) {
        const alert = namespace.dailyEconomy.alertById(state, existing.alertId);
        if (alert) { alert.active = false; alert.resolved = true; }
      }
      city.satisfactionShortageEpisode = null;
      return;
    }
    if (existing) {
      const alert = namespace.dailyEconomy.alertById(state, existing.alertId);
      if (alert) alert.message = `${city.name}: ${shortages.join(', ')}.`;
      return;
    }
    const alert = namespace.dailyEconomy.createAlert(state, { type: 'living-standards-shortage', title: 'Living Standards Shortage', message: `${city.name}: ${shortages.join(', ')}.`, critical: false });
    city.satisfactionShortageEpisode = { alertId: alert.id };
  }

  function evaluate(state, economy, mutate) {
    const byId = Object.fromEntries(economy.rows.filter((row) => row.scored).map((row) => [row.id, row]));
    const settlements = cities(state).map((city) => scoreSettlement(state, city, byId[city.id]));
    if (mutate) settlements.forEach((result) => {
      const city = cityById(state, result.cityId);
      city.satisfaction = round(result.nextDay, 1);
      city.satisfactionTarget = result.target;
      city.satisfactionBreakdown = result;
      updateShortageAlert(state, city, result);
    });
    return settlements;
  }

  function consumeDaily(state) {
    const economy = livingStandards(state, true);
    const settlements = evaluate(state, economy, true);
    const foodDetails = economy.foodTotals.filter((entry) => entry.layer === 1).map((entry) => ({
      category: entry.category, label: entry.category, required: entry.required, available: entry.available,
      consumed: round(entry.required * entry.coverage), missing: round(entry.required * (1 - entry.coverage)), coverage: entry.coverage
    }));
    const critical = economy.criticalRows.length > 0;
    let newEpisode = false;
    let alertId = null;
    const legacy = state.economy.shortageEpisode;
    if (!critical && foodDetails.every((detail) => detail.coverage >= 1 - EPSILON)) {
      if (legacy) {
        const alert = namespace.dailyEconomy.alertById(state, legacy.alertId);
        if (alert) { alert.active = false; alert.resolved = true; }
      }
      state.economy.shortageEpisode = null;
    } else if (!legacy) {
      const alert = namespace.dailyEconomy.createAlert(state, {
        type: 'food-shortage', title: critical ? 'Critical Food Shortage' : 'Food Shortage',
        message: foodDetails.filter((detail) => detail.coverage < 1 - EPSILON).map((detail) => detail.label).join(', '),
        details: foodDetails.filter((detail) => detail.coverage < 1 - EPSILON), critical
      });
      state.economy.shortageEpisode = { alertId: alert.id, critical };
      newEpisode = true;
      alertId = alert.id;
    } else {
      alertId = legacy.alertId;
      const alert = namespace.dailyEconomy.alertById(state, legacy.alertId);
      if (alert) {
        alert.message = foodDetails.filter((detail) => detail.coverage < 1 - EPSILON).map((detail) => detail.label).join(', ');
        alert.details = foodDetails.filter((detail) => detail.coverage < 1 - EPSILON).map((detail) => ({ ...detail }));
        if (critical && !legacy.critical) {
          alert.critical = true;
          alert.title = 'Critical Food Shortage';
          legacy.critical = true;
          newEpisode = true;
        }
      }
    }
    const result = { ...economy, settlements, food: { details: foodDetails, shortages: foodDetails.filter((detail) => detail.missing > 0), critical, newEpisode, alertId } };
    state.economy.satisfaction.lastDay = result;
    return result;
  }

  function previewSettlement(state, cityId) {
    const economy = livingStandards(state, false);
    return evaluate(state, economy, false).find((entry) => entry.cityId === cityId) || null;
  }

  function realmSummary(state) {
    const rows = cities(state).map((city) => previewSettlement(state, city.id));
    const population = cities(state).reduce((sum, city) => sum + Math.max(0, Number(city.population) || 0), 0);
    const weighted = (field) => population > EPSILON ? rows.reduce((sum, row) => sum + row[field] * Number(cityById(state, row.cityId).population || 0), 0) / population : 0;
    return { actual: round(weighted('actual'), 1), target: round(weighted('target'), 1), settlements: rows };
  }

  namespace.satisfaction = Object.freeze({
    ensureState, ensureSettlement, ensureService, cityById,
    requestMealCount, requestDrinkLevel, requestServiceCap, applyPending, consumers,
    plannedDailyDemand, livingStandards, consumeDaily, scoreSettlement,
    previewSettlement, realmSummary
  });
})(window.EcoRuler = window.EcoRuler || {});
