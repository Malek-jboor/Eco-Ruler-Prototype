(function initializeEconomyData(namespace) {
  const annualConstructionReferences = Object.freeze({
    wood: 4770, planks: 2160, stone: 1200, clay: 600, 'nails-fittings': 2000,
    bricks: 2400, 'roof-tiles': 1200, glass: 300, 'marble-blocks': 300
  });

  function construction(effort, days, materials, cashPercent, maintenancePercent = 8) {
    return Object.freeze({ effort, days, materials: Object.freeze({ ...materials }), cashPercent, maintenancePercent });
  }

  const c = construction;
  const constructionProfiles = Object.freeze({
    farm: c(0.1667, 20, { wood: 398, planks: 109, clay: 21 }, 50, 5),
    orchard: c(0.25, 30, { wood: 597, planks: 162, clay: 30 }, 50, 5),
    apiary: c(0.125, 15, { wood: 358, planks: 81, 'nails-fittings': 25 }, 50, 5),
    sheep: c(0.2083, 25, { wood: 547, planks: 135, 'nails-fittings': 63 }, 75, 8),
    cattle: c(0.25, 30, { wood: 656, planks: 162, 'nails-fittings': 75 }, 100, 8),
    horses: c(0.3333, 40, { wood: 875, planks: 216, 'nails-fittings': 100 }, 150, 8),
    deer: c(0.125, 15, { wood: 388, planks: 54, 'nails-fittings': 38 }, 50, 5),
    foxes: c(0.1, 12, { wood: 311, planks: 44, 'nails-fittings': 30 }, 50, 5),
    fish: c(0.125, 15, { wood: 328, planks: 81, 'nails-fittings': 38 }, 50, 5),
    pearls: c(0.35, 42, { wood: 752, planks: 303, 'nails-fittings': 105 }, 100, 8),
    wood: c(0.1667, 20, { wood: 557, planks: 73, 'nails-fittings': 34 }, 50, 5),
    stone: c(0.25, 30, { wood: 537, planks: 162, stone: 30, 'nails-fittings': 75 }, 50, 8),
    clay: c(0.1667, 20, { wood: 438, planks: 109, 'nails-fittings': 51 }, 50, 5),
    sand: c(0.3333, 40, { wood: 876, planks: 218, 'nails-fittings': 102 }, 50, 8),
    salt: c(0.25, 30, { wood: 299, planks: 81, stone: 90, clay: 38, 'nails-fittings': 25 }, 50, 8),
    bronzeMine: c(0.5, 60, { wood: 835, planks: 270, stone: 120, 'nails-fittings': 200 }, 100, 12),
    spiceGarden: c(0.5, 60, { wood: 1194, planks: 327, clay: 63 }, 150, 5),
    marbleQuarry: c(0.75, 90, { wood: 1074, planks: 800, stone: 180, bricks: 180, 'nails-fittings': 225 }, 75, 8)
  });

  const developmentConstructionProfiles = Object.freeze({
    warehouseVillage: c(0.25, 30, { wood: 299, planks: 108, stone: 90, clay: 23, 'nails-fittings': 50 }, 75, 5),
    warehouseUrban: c(0.5, 60, { wood: 597, planks: 216, stone: 180, clay: 45, 'nails-fittings': 100 }, 75, 5),
    residentialDistrict: c(0.5, 60, { wood: 597, planks: 216, stone: 90, bricks: 360, 'nails-fittings': 100 }, 50, 5)
  });

  function output(resourceId, label, annualAmount) {
    return Object.freeze({ resourceId, label, annualAmount });
  }

  function site(options) {
    const outputs = Object.freeze((options.outputs || []).map((item) => Object.freeze(item)));
    const workersPerLevel = Number.isFinite(options.workersPerLevel) ? options.workersPerLevel : null;
    const tier = options.tier || 1;
    return Object.freeze({
      tier,
      inputs: Object.freeze([]),
      outputs,
      workersPerLevel,
      productionTiming: options.productionTiming || 'continuous',
      harvestSeason: options.harvestSeason || null,
      construction: options.construction || null,
      resourceCapacityPerLevel: Number(options.resourceCapacityPerLevel) || 1,
      specialty: options.specialty || null,
      research: options.research || 'tier-' + tier,
      balanceStatus: options.balanceStatus || 'approved',
      buildable: Boolean(options.construction && workersPerLevel !== null && outputs.length)
    });
  }

  const rawSiteEconomy = Object.freeze({
    wheat: site({ outputs: [output('wheat', 'Wheat', 9000)], workersPerLevel: 75, productionTiming: 'seasonal', harvestSeason: 'Summer', construction: constructionProfiles.farm, specialty: 'agricultural' }),
    vegetables: site({ outputs: [output('vegetables', 'Vegetables', 3600)], workersPerLevel: 40, productionTiming: 'seasonal', harvestSeason: 'Spring', construction: constructionProfiles.farm, specialty: 'agricultural' }),
    cotton: site({ outputs: [output('cotton', 'Cotton', 528)], workersPerLevel: 36, productionTiming: 'seasonal', harvestSeason: 'Autumn', construction: constructionProfiles.farm, specialty: 'agricultural' }),
    herbs: site({ outputs: [output('herbs', 'Herbs', 720)], workersPerLevel: 30, productionTiming: 'seasonal', harvestSeason: 'Spring', construction: constructionProfiles.farm, specialty: 'agricultural' }),
    fruit: site({ outputs: [output('fruit', 'Fruit', 3600)], workersPerLevel: 40, productionTiming: 'seasonal', harvestSeason: 'Autumn', construction: constructionProfiles.orchard, specialty: 'agricultural' }),
    honey: site({ outputs: [output('honey', 'Honey', 1800), output('beeswax', 'Beeswax', 600)], workersPerLevel: 30, productionTiming: 'seasonal', harvestSeason: 'Summer', construction: constructionProfiles.apiary, specialty: 'agricultural' }),
    sheep: site({ outputs: [output('meat', 'Meat', 1440), output('milk', 'Milk', 480), output('wool', 'Wool', 2280)], workersPerLevel: 45, construction: constructionProfiles.sheep, specialty: 'agricultural' }),
    cattle: site({ outputs: [output('meat', 'Meat', 2400), output('milk', 'Milk', 1200), output('hides', 'Hides', 600)], workersPerLevel: 45, construction: constructionProfiles.cattle, specialty: 'agricultural' }),
    horses: site({ outputs: [output('horses', 'Horses', 240)], workersPerLevel: 35, construction: constructionProfiles.horses, specialty: 'agricultural' }),
    deer: site({ outputs: [output('meat', 'Meat', 3600), output('hides', 'Hides', 600)], workersPerLevel: 45, construction: constructionProfiles.deer, specialty: 'agricultural' }),
    foxes: site({ outputs: [output('fur', 'Fur', 1200)], workersPerLevel: 30, construction: constructionProfiles.foxes, specialty: 'agricultural' }),
    fish: site({ outputs: [output('fish', 'Fish', 3600)], workersPerLevel: 45, construction: constructionProfiles.fish, specialty: 'agricultural' }),
    pearls: site({ outputs: [], workersPerLevel: null, construction: constructionProfiles.pearls, specialty: 'extractive', balanceStatus: 'production-baseline-deferred' }),
    wood: site({ outputs: [output('wood', 'Wood', 4770)], workersPerLevel: 48, construction: constructionProfiles.wood, specialty: 'extractive' }),
    stone: site({ outputs: [output('stone', 'Stone', 1200)], workersPerLevel: 42, construction: constructionProfiles.stone, specialty: 'extractive' }),
    clay: site({ outputs: [output('clay', 'Clay', 600)], workersPerLevel: 30, construction: constructionProfiles.clay, specialty: 'extractive' }),
    sand: site({ outputs: [output('sand', 'Sand', 600)], workersPerLevel: 24, construction: constructionProfiles.sand, specialty: 'extractive' }),
    salt: site({ outputs: [output('salt', 'Salt', 120)], workersPerLevel: 12, construction: constructionProfiles.salt, specialty: 'extractive' }),
    copper: site({ outputs: [output('copper', 'Copper', 2250)], workersPerLevel: 60, construction: constructionProfiles.bronzeMine, specialty: 'extractive' }),
    tin: site({ outputs: [output('tin', 'Tin', 750)], workersPerLevel: 60, construction: constructionProfiles.bronzeMine, specialty: 'extractive' }),
    coal: site({ outputs: [output('coal', 'Coal', 7632)], workersPerLevel: 72, specialty: 'extractive', balanceStatus: 'construction-profile-deferred' }),
    iron: site({ tier: 2, outputs: [output('iron', 'Iron', 1800)], workersPerLevel: 60, specialty: 'extractive', balanceStatus: 'construction-profile-deferred' }),
    gold: site({ tier: 2, outputs: [output('gold', 'Gold', 100)], workersPerLevel: 60, specialty: 'extractive', balanceStatus: 'construction-profile-deferred' }),
    silver: site({ tier: 2, outputs: [output('silver', 'Silver', 150)], workersPerLevel: 60, specialty: 'extractive', balanceStatus: 'construction-profile-deferred' }),
    sulfur: site({ tier: 3, outputs: [output('sulfur', 'Sulfur', 100)], workersPerLevel: 36, specialty: 'extractive', balanceStatus: 'construction-profile-deferred' }),
    diamonds: site({ tier: 3, outputs: [output('diamonds', 'Diamonds', 8)], workersPerLevel: 36, specialty: 'extractive', balanceStatus: 'construction-profile-deferred' }),
    marble: site({ tier: 2, outputs: [output('marble', 'Marble', 600)], workersPerLevel: 48, construction: constructionProfiles.marbleQuarry, resourceCapacityPerLevel: 5, specialty: 'extractive' }),
    spices: site({ tier: 3, outputs: [], workersPerLevel: null, construction: constructionProfiles.spiceGarden, resourceCapacityPerLevel: 5, specialty: 'agricultural', balanceStatus: 'production-baseline-deferred' })
  });

  function materialCostFor(profile, multiplier = 1) {
    if (!profile) return null;
    if (profile.materials) {
      return Object.fromEntries(Object.entries(profile.materials).map(([materialId, amount]) => [
        materialId, Math.ceil(amount * multiplier)
      ]));
    }
    return Object.entries(profile.materialShares || {}).reduce((cost, [materialId, share]) => {
      const reference = annualConstructionReferences[materialId];
      if (Number.isFinite(reference)) cost[materialId] = Math.ceil(reference * profile.effort * share * multiplier);
      return cost;
    }, {});
  }

  function expansionMultiplier(currentLevel) {
    const level = Math.max(0, Number(currentLevel) || 0);
    return 1 + (0.1 * level) + (0.005 * level * level);
  }

  function constructionPreview(resourceId, currentLevel = 0, modifiers = {}) {
    const economy = rawSiteEconomy[resourceId];
    if (!economy || !economy.construction) return null;
    const multiplier = currentLevel > 0 ? expansionMultiplier(currentLevel) : 1;
    const provinceModifier = Number(modifiers.provinceModifier) || 1;
    const technologyModifier = Number(modifiers.technologyModifier) || 1;
    const materialModifier = Number(modifiers.materialModifier) || 1;
    const durationModifier = Number(modifiers.durationModifier) || 1;
    return {
      resourceId,
      targetLevel: currentLevel + 1,
      multiplier,
      materials: materialCostFor(economy.construction, multiplier * materialModifier),
      cashPercent: economy.construction.cashPercent,
      cashAmount: null,
      days: Math.max(1, Math.ceil(economy.construction.days * Math.sqrt(multiplier) * provinceModifier * technologyModifier * durationModifier)),
      provinceModifier,
      technologyModifier,
      materialModifier,
      durationModifier
    };
  }

  function warehousePreview(settlementTier = 'town') {
    const isVillage = settlementTier === 'village';
    const profile = isVillage
      ? developmentConstructionProfiles.warehouseVillage
      : developmentConstructionProfiles.warehouseUrban;
    return {
      buildingId: 'warehouse', label: 'Warehouse',
      materials: materialCostFor(profile),
      cashPercent: profile.cashPercent,
      cashAmount: null,
      days: profile.days,
      effort: profile.effort,
      maintenancePercent: profile.maintenancePercent,
      capacityAdded: isVillage ? 3000 : 7500,
      settlementClass: isVillage ? 'village' : 'urban'
    };
  }

  namespace.economyData = Object.freeze({
    annualConstructionReferences,
    constructionProfiles,
    developmentConstructionProfiles,
    rawSiteEconomy,
    materialCostFor,
    expansionMultiplier,
    constructionPreview,
    warehousePreview
  });
})(window.EcoRuler = window.EcoRuler || {});
