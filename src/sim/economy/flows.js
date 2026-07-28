(function initializeFlowEconomy(namespace) {
  const FLOW_GROUP_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'food', label: 'Food', icon: 'wheat', categories: Object.freeze(['food']) }),
    Object.freeze({
      id: 'raw-materials',
      label: 'Raw Materials',
      icon: 'trees',
      categories: Object.freeze(['construction-materials', 'metals-industry', 'natural-trade', 'raw-goods'])
    }),
    Object.freeze({
      id: 'industrial-goods',
      label: 'Industrial Goods',
      icon: 'factory',
      categories: Object.freeze(['industrial-goods', 'equipment'])
    }),
    Object.freeze({ id: 'civilian-goods', label: 'Civilian Goods', icon: 'shirt', categories: Object.freeze(['civilian-goods']) }),
    Object.freeze({ id: 'military-supplies', label: 'Military Supplies', icon: 'shield', categories: Object.freeze(['military-supplies']) })
  ]);
  const CENTRAL_STORAGE_ITEMS = Object.freeze(
    namespace.storageLedger.storageItems.filter((item) => item.capacity === 'warehouse')
  );
  const FLOW_GROUPS = Object.freeze(FLOW_GROUP_DEFINITIONS.map((definition) => Object.freeze({
    id: definition.id,
    label: definition.label,
    icon: definition.icon,
    itemIds: Object.freeze(CENTRAL_STORAGE_ITEMS
      .filter((item) => definition.categories.includes(item.category))
      .map((item) => item.id))
  })));

  function round(value, digits = 4) {
    return namespace.storageLedger.roundTo(value, digits);
  }

  function groupForItem(resourceId) {
    return FLOW_GROUPS.find((group) => group.itemIds.includes(resourceId))
      || FLOW_GROUPS[1];
  }

  function blankRows() {
    return Object.fromEntries(CENTRAL_STORAGE_ITEMS.map((item) => [item.id, {
      resourceId: item.id,
      label: item.label,
      groupId: groupForItem(item.id).id,
      current: 0,
      dailyNet: 0,
      seasonalNet: 0,
      dailyContributors: [],
      seasonalContributors: []
    }]));
  }

  function addContribution(row, period, label, amount, detailLabel = label) {
    const value = round(amount);
    if (!row || !value) return;
    const key = period === 'daily' ? 'dailyContributors' : 'seasonalContributors';
    let existing = row[key].find((entry) => entry.label === label);
    if (!existing) {
      existing = { label, amount: 0, details: [] };
      row[key].push(existing);
    }
    existing.amount = round(existing.amount + value);
    const detail = existing.details.find((entry) => entry.label === detailLabel);
    if (detail) detail.amount = round(detail.amount + value);
    else existing.details.push({ label: detailLabel, amount: value });
    if (period === 'daily') row.dailyNet = round(row.dailyNet + value);
    else row.seasonalNet = round(row.seasonalNet + value);
  }

  function proteinDemandShares(state, required) {
    const resources = namespace.dailyEconomy.PROTEIN_RESOURCES;
    const quantities = resources.map((resourceId) => Math.max(0, Number(state.storage.available[resourceId]) || 0));
    const total = quantities.reduce((sum, amount) => sum + amount, 0);
    if (total <= 0) {
      return Object.fromEntries(resources.map((resourceId) => [resourceId, required / resources.length]));
    }
    return Object.fromEntries(resources.map((resourceId, index) => [
      resourceId,
      required * (quantities[index] / total)
    ]));
  }

  function recurringProduction(state, rows) {
    state.map.regions.forEach((region) => {
      (region.resourceSites || []).forEach((site) => {
        if (site.actualWorkers <= 0) return;
        const preview = namespace.workforce.outputPreview(region, site);
        if (!preview || preview.productionTiming !== 'continuous') return;
        preview.outputs.forEach((output) => {
          addContribution(rows[output.resourceId], 'daily', 'Raw Production', output.dailyAmount,
            (preview.label || site.resourceId + ' production') + ' - ' + region.name);
        });
      });
    });

    if (namespace.manufacturing) {
      const plan = namespace.manufacturing.planDay(state);
      plan.lines.forEach((line) => {
        const label = line.definition.label + ' - ' + line.city.name;
        addContribution(rows[line.recipe.outputId], 'daily', 'Processing Output', line.actualOutput, label);
        Object.entries(line.actualInputs).forEach(([resourceId, amount]) => {
          addContribution(rows[resourceId], 'daily', 'Processing Inputs', -amount, label);
        });
      });
    }
  }

  function recurringConsumption(state, rows) {
    if (namespace.satisfaction) {
      const demand = namespace.satisfaction.plannedDailyDemand(state);
      const consumers = namespace.satisfaction.consumers(state);
      Object.entries(demand).forEach(([resourceId, amount]) => {
        if (!rows[resourceId]) return;
        const food = namespace.satisfactionData.foodCategories.find((definition) => definition.resources.includes(resourceId));
        const clothing = namespace.satisfactionData.clothingResources.includes(resourceId);
        const drink = namespace.satisfactionData.drinkResources.includes(resourceId);
        const weighted = consumers.map((consumer) => {
          let weight = consumer.population;
          if (food) weight *= consumer.mealCount;
          else if (drink) weight *= namespace.satisfactionData.drinkLevels[consumer.drinkLevel].dailyPerPerson;
          else if (!clothing) weight = 0;
          return { consumer, weight };
        });
        const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
        if (totalWeight <= 0) addContribution(rows[resourceId], 'daily', 'Civilian Consumption', -amount, 'Realm total');
        else weighted.forEach((entry) => {
          if (entry.weight <= 0) return;
          addContribution(rows[resourceId], 'daily', 'Civilian Consumption', -amount * entry.weight / totalWeight,
            entry.consumer.city.name);
        });
      });
      return;
    }
    const totalNeed = namespace.dailyEconomy.realmPopulation(state) / 10;
    const fixed = [
      ['bread', namespace.dailyEconomy.FOOD_SHARES.bread, 'Civilian bread demand'],
      ['vegetables', namespace.dailyEconomy.FOOD_SHARES.vegetables, 'Civilian vegetable demand'],
      ['fruit', namespace.dailyEconomy.FOOD_SHARES.fruit, 'Civilian fruit demand']
    ];
    fixed.forEach(([resourceId, share, label]) => addContribution(rows[resourceId], 'daily', 'Civilian Consumption', -(totalNeed * share), label));
    const proteinNeed = totalNeed * namespace.dailyEconomy.FOOD_SHARES.protein;
    Object.entries(proteinDemandShares(state, proteinNeed)).forEach(([resourceId, amount]) => {
      addContribution(rows[resourceId], 'daily', 'Civilian Consumption', -amount, 'Civilian protein demand');
    });
  }
  function recurringServices(state, rows) {
    if (namespace.administration) {
      namespace.administration.planDay(state).lines.forEach((line) => {
        const label = line.definition.label + ' - ' + line.city.name;
        addContribution(rows.paper, 'daily', 'Administration', -line.paperUsed, label);
        addContribution(rows.books, 'daily', 'Administration', -line.booksUsed, label);
      });
    }
    (state.player.cities || []).forEach((city) => {
      const medical = city.healthBreakdown && city.healthBreakdown.medical;
      Object.values(medical || {}).forEach((entry) => {
        if (rows[entry.productId]) addContribution(rows[entry.productId], 'daily', 'Medical Distribution',
          -Number(entry.consumed || 0), city.name);
      });
    });
  }
  function recurringMaintenance(state, rows) {
    if (!namespace.developmentEconomy || !namespace.developmentEconomy.maintenancePreview) return;
    namespace.developmentEconomy.maintenancePreview(state).forEach((entry) => {
      Object.entries(entry.actualNeed || {}).forEach(([resourceId, amount]) => {
        if (rows[resourceId]) addContribution(rows[resourceId], 'daily', 'Maintenance', -amount,
          entry.label + ' - ' + entry.location);
      });
    });
  }
  function recurringSpoilage(state, rows) {
    CENTRAL_STORAGE_ITEMS.forEach((item) => {
      const amount = Math.max(0, Number(state.storage.available[item.id]) || 0);
      const annualLoss = namespace.dailyEconomy.spoilageRate(item.id);
      if (!amount || annualLoss <= 0) return;
      const dailyLoss = amount - amount * ((1 - annualLoss) ** (1 / 120));
      addContribution(rows[item.id], 'daily', 'Spoilage', -dailyLoss, 'Projected daily spoilage');
    });
  }

  function seasonalDailyEquivalent(state, rows) {
    state.map.regions.forEach((region) => {
      (region.resourceSites || []).forEach((site) => {
        if (site.actualWorkers <= 0) return;
        const preview = namespace.workforce.outputPreview(region, site);
        if (!preview || preview.productionTiming !== 'seasonal') return;
        preview.outputs.forEach((output) => {
          addContribution(rows[output.resourceId], 'daily', 'Seasonal Production Average', output.dailyAmount,
            (preview.label || site.resourceId + ' production') + ' - ' + region.name);
        });
      });
    });
  }
  function seasonalHarvestProjection(state, rows, daysRemaining) {
    state.map.regions.forEach((region) => {
      (region.resourceSites || []).forEach((site) => {
        const preview = namespace.workforce.outputPreview(region, site);
        if (!preview || preview.productionTiming !== 'seasonal' || preview.harvestSeason !== state.clock.season) return;
        preview.outputs.forEach((output) => {
          const accrued = Number(site.seasonalAccrual && site.seasonalAccrual[output.resourceId]) || 0;
          const remaining = site.actualWorkers > 0 ? output.dailyAmount * daysRemaining : 0;
          addContribution(rows[output.resourceId], 'seasonal', preview.harvestSeason + ' Harvest', accrued + remaining,
            (preview.label || site.resourceId + ' production') + ' - ' + region.name);
        });
      });
    });
  }

  function inventorySnapshot(state) {
    const rows = blankRows();
    CENTRAL_STORAGE_ITEMS.forEach((item) => {
      rows[item.id].current = round(state.storage.available[item.id] || 0);
    });
    recurringProduction(state, rows);
    recurringConsumption(state, rows);
    recurringServices(state, rows);
    recurringMaintenance(state, rows);
    recurringSpoilage(state, rows);

    const daysRemaining = Math.max(1, namespace.data.timeScale.seasonLengthDays - Number(state.clock.day || 1) + 1);
    Object.values(rows).forEach((row) => {
      row.dailyContributors.forEach((entry) => {
        const details = entry.details && entry.details.length ? entry.details : [entry];
        details.forEach((detail) => addContribution(row, 'seasonal', entry.label,
          detail.amount * daysRemaining, detail.label + ' x ' + daysRemaining + ' days'));
      });
    });
    seasonalHarvestProjection(state, rows, daysRemaining);
    seasonalDailyEquivalent(state, rows);


    const groups = FLOW_GROUPS.map((group) => ({
      ...group,
      rows: group.itemIds.map((resourceId) => rows[resourceId]).filter(Boolean)
    }));
    return { daysRemaining, rows, groups };
  }

  function ensureSeasonTracker(state) {
    const economy = namespace.dailyEconomy.ensureEconomyState(state);
    const key = String(state.clock.year);
    if (!economy.seasonTracker || economy.seasonTracker.key !== key) {
      economy.seasonTracker = {
        key,
        year: state.clock.year,
        startingStock: Object.fromEntries(CENTRAL_STORAGE_ITEMS.map((item) => [
          item.id,
          round(state.storage.available[item.id] || 0)
        ])),
        transactionStartIndex: state.storage.transactions.length
      };
    }
    return economy.seasonTracker;
  }

  function sumQuantities(target, quantities, multiplier = 1) {
    Object.entries(quantities || {}).forEach(([resourceId, amount]) => {
      if (!target[resourceId]) target[resourceId] = 0;
      target[resourceId] = round(target[resourceId] + Number(amount || 0) * multiplier);
    });
  }

  function reportBuckets(transactions) {
    const buckets = { production: {}, consumption: {}, spoilage: {}, constructionOther: {} };
    transactions.forEach((transaction) => {
      if (transaction.type === 'continuous-production' || transaction.type === 'seasonal-harvest' || transaction.type === 'manufacturing-production') {
        sumQuantities(buckets.production, transaction.quantities);
      } else if (['civilian-food-consumed', 'civilian-clothes-consumed', 'civilian-drinks-consumed', 'annual-simple-clothes-consumed'].includes(transaction.type)) {
        sumQuantities(buckets.consumption, transaction.quantities);
      } else if (transaction.type === 'daily-spoilage') {
        sumQuantities(buckets.spoilage, transaction.quantities);
      } else if ([
        'materials-reserved',
        'manufacturing-inputs-consumed',
        'maintenance-materials',
        'tools-assigned',
        'tool-replacements'
      ].includes(transaction.type)) {
        sumQuantities(buckets.constructionOther, transaction.quantities);
      } else if (transaction.type === 'materials-refunded' || transaction.type === 'tools-returned') {
        sumQuantities(buckets.constructionOther, transaction.quantities, -1);
      }
    });
    return buckets;
  }
  function openSeasonReport(state, alertId) {
    const alert = namespace.dailyEconomy.alertById(state, alertId);
    if (!alert || alert.type !== 'annual-report' || !alert.report) return false;
    const ui = state.ui || (state.ui = {});
    if (!ui.seasonalReportModalId) {
      ui.seasonalReportPreviousSpeed = Number(state.clock && state.clock.speed) || 0;
    }
    ui.seasonalReportModalId = alert.id;
    namespace.timeEngine.ensureClock(state).speed = 1;
    return true;
  }

  function closeSeasonReport(state) {
    const ui = state.ui || (state.ui = {});
    if (!ui.seasonalReportModalId) return false;
    const clock = namespace.timeEngine.ensureClock(state);
    const previous = [0].concat(namespace.timeEngine.SPEEDS)
      .includes(Number(ui.seasonalReportPreviousSpeed))
      ? Number(ui.seasonalReportPreviousSpeed)
      : 1;
    ui.seasonalReportModalId = null;
    clock.speed = previous;
    if (previous > 0) clock.previousSpeed = previous;
    clock.elapsedRealMs = 0;
    delete ui.seasonalReportPreviousSpeed;
    return true;
  }


  function finishSeason(state) {
    const tracker = ensureSeasonTracker(state);
    const transactions = state.storage.transactions.slice(tracker.transactionStartIndex);
    const buckets = reportBuckets(transactions);
    const rows = CENTRAL_STORAGE_ITEMS.map((item) => {
      const starting = round(tracker.startingStock[item.id] || 0);
      const ending = round(state.storage.available[item.id] || 0);
      const production = round(buckets.production[item.id] || 0);
      const consumption = round(buckets.consumption[item.id] || 0);
      const spoilage = round(buckets.spoilage[item.id] || 0);
      const constructionOther = round(buckets.constructionOther[item.id] || 0);
      const net = round(ending - starting);
      return {
        resourceId: item.id,
        label: item.label,
        groupId: groupForItem(item.id).id,
        starting,
        production,
        consumption,
        spoilage,
        constructionOther,
        net,
        ending,
        status: net > 0 ? 'Surplus' : net < 0 ? 'Deficit' : 'Balanced',
        contributors: [
          { label: 'Production', amount: production },
          { label: 'Consumption', amount: -consumption },
          { label: 'Spoilage / Losses', amount: -spoilage },
          { label: 'Construction / Other Use', amount: -constructionOther }
        ].filter((entry) => entry.amount !== 0)
      };
    });
    const report = {
      id: 'annual-report-' + tracker.year,
      year: tracker.year,
      title: 'Year ' + tracker.year + ' Production Report',
      rows
    };
    const surplusCount = rows.filter((row) => row.net > 0).length;
    const deficitCount = rows.filter((row) => row.net < 0).length;
    const alert = namespace.dailyEconomy.createAlert(state, {
      type: 'annual-report',
      title: report.title,
      message: surplusCount + ' surplus items, ' + deficitCount + ' deficit items.',
      critical: false,
      report
    });
    openSeasonReport(state, alert.id);
    return { report, alert };
  }

  function startNextSeason(state) {
    const economy = namespace.dailyEconomy.ensureEconomyState(state);
    if (economy.seasonTracker && economy.seasonTracker.year !== state.clock.year) economy.seasonTracker = null;
    return ensureSeasonTracker(state);
  }

  function deleteAlert(state, alertId) {
    const index = (state.alerts || []).findIndex((alert) => alert.id === alertId);
    if (index < 0) return false;
    state.alerts.splice(index, 1);
    if (state.ui && state.ui.seasonalReportModalId === alertId) {
      closeSeasonReport(state);
    }
    return true;
  }

  namespace.flowEconomy = Object.freeze({
    FLOW_GROUPS,
    groupForItem,
    CENTRAL_STORAGE_ITEMS,
    inventorySnapshot,
    ensureSeasonTracker,
    finishSeason,
    startNextSeason,
    openSeasonReport,
    closeSeasonReport,
    deleteAlert
  });
})(window.EcoRuler = window.EcoRuler || {});
