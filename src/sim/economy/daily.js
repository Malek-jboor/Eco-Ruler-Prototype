(function initializeDailyEconomy(namespace) {
  const FOOD_SHARES = Object.freeze({
    bread: 0.45,
    protein: 0.25,
    vegetables: 0.2,
    fruit: 0.1
  });
  const PROTEIN_RESOURCES = Object.freeze(['meat', 'fish', 'butter', 'cheese', 'spiced-meat']);
  const ANNUAL_SPOILAGE = Object.freeze({
    wheat: 0.25,
    flour: 0.1,
    herbs: 0.1,
    salt: 0.05,
    spices: 0.05,
    honey: 0.05,
    beeswax: 0
  });
  const DEFAULT_PERISHABLE_LOSS = 0.5;
  const PERISHABLE_RESOURCES = new Set([
    'bread', 'meat', 'fish', 'milk', 'vegetables', 'fruit', 'butter', 'cheese', 'spiced-meat'
  ]);

  function ensureEconomyState(state) {
    state.economy = state.economy || {};
    state.economy.settlementFood = state.economy.settlementFood || {};
    state.economy.shortageEpisode = state.economy.shortageEpisode || null;
    state.economy.harvestHistory = Array.isArray(state.economy.harvestHistory)
      ? state.economy.harvestHistory
      : [];
    state.economy.productionHistory = Array.isArray(state.economy.productionHistory)
      ? state.economy.productionHistory
      : [];
    state.alerts = Array.isArray(state.alerts) ? state.alerts : [];
    state.nextAlertNumber = Math.max(1, Number(state.nextAlertNumber) || 1);
    return state.economy;
  }

  function currentDate(state) {
    return {
      year: state.clock.year,
      season: state.clock.season,
      day: state.clock.day
    };
  }

  function dateLabel(date) {
    return `Year ${date.year}, ${date.season}, Day ${date.day}`;
  }

  function addStateLog(state, message) {
    state.log = Array.isArray(state.log) ? state.log : [];
    state.log = [message, ...state.log].slice(0, 40);
  }

  function createAlert(state, options) {
    ensureEconomyState(state);
    const alert = {
      id: `alert-${state.nextAlertNumber}`,
      type: options.type || 'information',
      title: options.title || 'Realm Notice',
      message: options.message || '',
      details: Array.isArray(options.details) ? options.details.map((detail) => ({ ...detail })) : [],
      report: options.report ? JSON.parse(JSON.stringify(options.report)) : null,
      critical: Boolean(options.critical),
      active: options.active !== false,
      resolved: false,
      iconDismissed: false,
      createdAt: { ...(options.createdAt || currentDate(state)) }
    };
    state.nextAlertNumber += 1;
    state.alerts.unshift(alert);
    addStateLog(state, `${alert.title}: ${alert.message}`);
    return alert;
  }

  function alertById(state, alertId) {
    return (state.alerts || []).find((alert) => alert.id === alertId) || null;
  }

  function realmPopulation(state) {
    return (state.player.cities || []).reduce((total, city) => total + Math.max(0, Number(city.population) || 0), 0)
      + (state.player.outposts || []).reduce((total, outpost) => total + Math.max(0, Number(outpost.population) || 0), 0);
  }

  function availableGroup(ledger, resourceIds) {
    return resourceIds.reduce((total, resourceId) => (
      total + Math.max(0, Number(ledger.available[resourceId]) || 0)
    ), 0);
  }

  function consumeFood(state) {
    const economy = ensureEconomyState(state);
    const population = realmPopulation(state);
    const totalNeed = population / 10;
    const ledger = state.storage;
    const definitions = [
      { id: 'bread', label: 'Bread', share: FOOD_SHARES.bread, resources: ['bread'] },
      { id: 'protein', label: 'Protein', share: FOOD_SHARES.protein, resources: PROTEIN_RESOURCES },
      { id: 'vegetables', label: 'Vegetables', share: FOOD_SHARES.vegetables, resources: ['vegetables'] },
      { id: 'fruit', label: 'Fruit', share: FOOD_SHARES.fruit, resources: ['fruit'] }
    ];

    const details = definitions.map((definition) => {
      const required = namespace.storageLedger.roundTo(totalNeed * definition.share);
      const available = namespace.storageLedger.roundTo(availableGroup(ledger, definition.resources));
      const result = definition.resources.length === 1
        ? namespace.storageLedger.consume(ledger, definition.resources[0], required, 'civilian-food-consumed')
        : namespace.storageLedger.consumeGroup(ledger, definition.resources, required, 'civilian-food-consumed');
      return {
        category: definition.id,
        label: definition.label,
        required,
        available,
        consumed: definition.resources.length === 1 ? result.consumed : result.consumedTotal,
        missing: result.missing,
        coverage: required > 0 ? Math.min(1, (definition.resources.length === 1 ? result.consumed : result.consumedTotal) / required) : 1
      };
    });

    const shortages = details.filter((detail) => detail.missing > 0);
    const date = currentDate(state);
    economy.settlementFood = {
      date,
      population,
      totalNeed,
      categories: details
    };

    if (!shortages.length) {
      if (economy.shortageEpisode) {
        const previousAlert = alertById(state, economy.shortageEpisode.alertId);
        if (previousAlert) {
          previousAlert.active = false;
          previousAlert.resolved = true;
        }
        economy.shortageEpisode = null;
      }
      return { population, details, shortages: [], critical: false, newEpisode: false };
    }

    const fullyMissing = shortages.some((detail) => detail.available <= 0);
    let newEpisode = false;
    if (!economy.shortageEpisode) {
      const alert = createAlert(state, {
        type: 'food-shortage',
        title: fullyMissing ? 'Critical Food Shortage' : 'Food Shortage',
        message: shortages.map((detail) => detail.label).join(', '),
        details: shortages,
        critical: fullyMissing,
        createdAt: date
      });
      economy.shortageEpisode = {
        alertId: alert.id,
        startedAt: date,
        critical: fullyMissing
      };
      newEpisode = true;
    } else {
      const alert = alertById(state, economy.shortageEpisode.alertId);
      if (alert) {
        alert.details = shortages.map((detail) => ({ ...detail }));
        alert.message = shortages.map((detail) => detail.label).join(', ');
        if (fullyMissing) {
          alert.critical = true;
          alert.title = 'Critical Food Shortage';
          economy.shortageEpisode.critical = true;
        }
      }
    }

    return {
      population,
      details,
      shortages,
      critical: fullyMissing,
      newEpisode,
      alertId: economy.shortageEpisode.alertId
    };
  }

  function consumeAnnualClothes(state) {
    if (state.clock.season !== 'Winter' || state.clock.day !== 30) return null;
    const required = realmPopulation(state) / 10;
    const result = namespace.storageLedger.consume(
      state.storage,
      'simple-clothes',
      required,
      'annual-simple-clothes-consumed'
    );
    const coverage = required > 0 ? result.consumed / required : 1;
    ensureEconomyState(state).clothesCoverage = {
      year: state.clock.year,
      required,
      consumed: result.consumed,
      missing: result.missing,
      coverage
    };
    if (result.missing > 0) {
      createAlert(state, {
        type: 'civilian-shortage',
        title: 'Simple Clothes Shortage',
        message: `${namespace.storageLedger.roundTo(result.missing)} units are missing for annual civilian coverage.`,
        critical: false
      });
    }
    return ensureEconomyState(state).clothesCoverage;
  }

  function spoilageRate(resourceId) {
    if (Object.prototype.hasOwnProperty.call(ANNUAL_SPOILAGE, resourceId)) {
      return ANNUAL_SPOILAGE[resourceId];
    }
    return PERISHABLE_RESOURCES.has(resourceId) ? DEFAULT_PERISHABLE_LOSS : 0;
  }

  function applySpoilage(state, elapsedDays = 1) {
    const spoiled = {};
    Object.entries({ ...(state.storage.available || {}) }).forEach(([resourceId, amount]) => {
      const annualLoss = spoilageRate(resourceId);
      if (annualLoss <= 0 || amount <= 0) return;
      const remaining = amount * ((1 - annualLoss) ** (elapsedDays / 120));
      const loss = namespace.storageLedger.roundTo(Math.max(0, amount - remaining));
      if (loss <= 0) return;
      namespace.storageLedger.addQuantities(state.storage.available, { [resourceId]: loss }, -1);
      spoiled[resourceId] = loss;
    });
    if (Object.keys(spoiled).length) {
      state.storage.transactions.push({
        sequence: state.storage.transactions.length + 1,
        type: 'daily-spoilage',
        quantities: spoiled,
        elapsedDays
      });
    }
    return spoiled;
  }

  function addRequested(target, resourceId, amount) {
    if (!namespace.storageLedger.storageItemById[resourceId]) return;
    target[resourceId] = namespace.storageLedger.roundTo((target[resourceId] || 0) + amount);
  }

  function collectProduction(state) {
    const continuous = {};
    const harvest = {};
    const harvestedSites = [];
    const horseProduction = [];

    state.map.regions.forEach((region) => {
      (region.resourceSites || []).forEach((site) => {
        const preview = namespace.workforce.outputPreview(region, site);
        if (!preview || site.actualWorkers <= 0) return;

        if (preview.productionTiming === 'seasonal') {
          site.seasonalAccrual = site.seasonalAccrual || {};
          preview.outputs.forEach((output) => {
            site.seasonalAccrual[output.resourceId] = namespace.storageLedger.roundTo(
              (site.seasonalAccrual[output.resourceId] || 0) + output.dailyAmount
            );
          });
          if (state.clock.day === 30 && state.clock.season === preview.harvestSeason) {
            Object.entries(site.seasonalAccrual).forEach(([resourceId, amount]) => {
              addRequested(harvest, resourceId, amount);
            });
            harvestedSites.push({ regionId: region.id, siteId: site.id, resourceId: site.resourceId });
            site.seasonalAccrual = {};
          }
          return;
        }

        preview.outputs.forEach((output) => {
          if (output.resourceId === 'horses') {
            const capacity = site.level * 240;
            site.localStock = site.localStock || {};
            const current = Number(site.localStock.horses) || 0;
            const accepted = Math.min(output.dailyAmount, Math.max(0, capacity - current));
            site.localStock.horses = namespace.storageLedger.roundTo(current + accepted);
            horseProduction.push({ siteId: site.id, accepted, blocked: output.dailyAmount - accepted });
            return;
          }
          addRequested(continuous, output.resourceId, output.dailyAmount);
        });
      });
    });

    return { continuous, harvest, harvestedSites, horseProduction };
  }

  function addStorageAlert(state, title, message, type) {
    const today = currentDate(state);
    const existing = (state.alerts || []).find((alert) => (
      alert.type === type
      && !alert.resolved
      && alert.createdAt.year === today.year
      && alert.createdAt.season === today.season
      && alert.createdAt.day === today.day
    ));
    return existing || createAlert(state, {
      type,
      title,
      message,
      critical: false,
      createdAt: today
    });
  }

  function projectedHarvest(state) {
    const projected = {};
    state.map.regions.forEach((region) => {
      (region.resourceSites || []).forEach((site) => {
        const preview = namespace.workforce.outputPreview(region, site);
        if (!preview || preview.productionTiming !== 'seasonal') return;
        if (preview.harvestSeason !== state.clock.season) return;
        preview.outputs.forEach((output) => {
          const amount = (site.seasonalAccrual && site.seasonalAccrual[output.resourceId] || 0)
            + (site.actualWorkers > 0 ? output.dailyAmount : 0);
          addRequested(projected, output.resourceId, amount);
        });
      });
    });
    return projected;
  }

  function warnBeforeHarvest(state) {
    if (state.clock.day !== 29) return null;
    const projected = projectedHarvest(state);
    const required = namespace.storageLedger.storagePointsFor(projected);
    const free = namespace.storageLedger.storageSummary(state.storage).free;
    if (required <= free) return null;
    const key = `${state.clock.year}-${state.clock.season}`;
    const economy = ensureEconomyState(state);
    if (economy.lastHarvestWarningKey === key) return null;
    economy.lastHarvestWarningKey = key;
    return createAlert(state, {
      type: 'harvest-capacity',
      title: 'Harvest Storage Warning',
      message: `Tomorrow's harvest needs approximately ${required.toFixed(2)} storage points, but only ${free.toFixed(2)} are free.`,
      critical: false
    });
  }

  function applyProductCaps(ledger, requested = {}) {
    const accepted = {};
    const blocked = {};
    Object.entries(requested).forEach(([resourceId, rawAmount]) => {
      const amount = Math.max(0, Number(rawAmount) || 0);
      const availability = namespace.storageLedger.productCapAvailability(ledger, resourceId);
      const allowed = availability.stopped ? 0 : Math.min(amount, availability.remaining);
      if (allowed > 0) accepted[resourceId] = namespace.storageLedger.roundTo(allowed);
      if (amount - allowed > 0.000001) blocked[resourceId] = namespace.storageLedger.roundTo(amount - allowed);
    });
    return { accepted, blocked };
  }

  function processProduction(state) {
    const economy = ensureEconomyState(state);
    const collected = collectProduction(state);
    const continuousCaps = applyProductCaps(state.storage, collected.continuous);
    const continuous = namespace.storageLedger.storeProportional(state.storage, continuousCaps.accepted, {
      type: 'continuous-production'
    });
    namespace.storageLedger.refreshProductCapStates(state.storage);
    const harvestCaps = applyProductCaps(state.storage, collected.harvest);
    const harvest = namespace.storageLedger.storeProportional(state.storage, harvestCaps.accepted, {
      type: 'seasonal-harvest'
    });
    namespace.storageLedger.refreshProductCapStates(state.storage);

    if (Object.keys(continuous.rejected).length) {
      addStorageAlert(
        state,
        'Storage Full',
        'Some continuous production was blocked because Central Storage is full.',
        'storage-full'
      );
    }
    if (Object.keys(harvest.rejected).length) {
      addStorageAlert(
        state,
        'Harvest Overflow Lost',
        'Part of the seasonal harvest was lost because Central Storage is full.',
        'harvest-overflow'
      );
    }
    if (collected.harvestedSites.length) {
      createAlert(state, {
        type: 'harvest',
        title: `${state.clock.season} Harvest`,
        message: Object.entries(harvest.accepted)
          .map(([resourceId, amount]) => `${namespace.storageLedger.roundTo(amount)} ${namespace.storageLedger.storageItemById[resourceId].label}`)
          .join(', ') || 'No harvest could be stored.',
        critical: false
      });
      economy.harvestHistory.unshift({
        date: currentDate(state),
        accepted: harvest.accepted,
        lost: harvest.rejected,
        sites: collected.harvestedSites
      });
      economy.harvestHistory = economy.harvestHistory.slice(0, 20);
    }

    economy.productionHistory.unshift({
      date: currentDate(state),
      continuous: continuous.accepted,
      blocked: continuous.rejected,
      maxCapBlocked: continuousCaps.blocked,
      harvest: harvest.accepted,
      harvestLost: harvest.rejected,
      harvestMaxCapBlocked: harvestCaps.blocked
    });
    economy.productionHistory = economy.productionHistory.slice(0, 20);
    warnBeforeHarvest(state);
    return { ...collected, continuousResult: continuous, harvestResult: harvest, continuousCaps, harvestCaps };
  }

  namespace.dailyEconomy = Object.freeze({
    FOOD_SHARES,
    PROTEIN_RESOURCES,
    ANNUAL_SPOILAGE,
    ensureEconomyState,
    currentDate,
    dateLabel,
    createAlert,
    alertById,
    realmPopulation,
    consumeFood,
    consumeAnnualClothes,
    spoilageRate,
    applySpoilage,
    collectProduction,
    projectedHarvest,
    warnBeforeHarvest,
    applyProductCaps,
    processProduction
  });
})(window.EcoRuler = window.EcoRuler || {});
