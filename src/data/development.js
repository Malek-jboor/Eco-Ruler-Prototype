(function initializeDevelopmentData(namespace) {
  const settlementLevels = Object.freeze({
    village: Object.freeze({ referenceDevelopmentCapacity: 2, developmentCapacity: 2, landResourceMultiplier: 1 }),
    town: Object.freeze({ referenceDevelopmentCapacity: 10, developmentCapacity: 10, landResourceMultiplier: 0.6 }),
    city: Object.freeze({ referenceDevelopmentCapacity: 20, developmentCapacity: 20, landResourceMultiplier: 0.4 }),
    metropolis: Object.freeze({ referenceDevelopmentCapacity: 40, developmentCapacity: 40, landResourceMultiplier: 0.2 }),
  });

  const specialtyResources = Object.freeze({
    agricultural: Object.freeze(new Set([
      'wheat', 'vegetables', 'fruit', 'cotton', 'herbs', 'spices',
      'cattle', 'sheep', 'horses', 'honey', 'fish'
    ])),
    extractive: Object.freeze(new Set([
      'wood', 'iron', 'copper', 'tin', 'coal', 'sulfur', 'gold', 'silver',
      'diamonds', 'stone', 'marble', 'clay', 'sand', 'salt', 'pearls'
    ]))
  });

  const villageSpecialties = Object.freeze({
    agricultural: Object.freeze({
      id: 'agricultural', label: 'Agricultural Village', developmentMultiplier: 0.75,
      matchingResourceBonus: 0.2, landResourceMultiplier: 1,
      allowedBuildings: Object.freeze(['warehouse', 'tannery', 'grain-mill', 'clinic'])
    }),
    extractive: Object.freeze({
      id: 'extractive', label: 'Extractive Village', developmentMultiplier: 0.75,
      matchingResourceBonus: 0.2, landResourceMultiplier: 1,
      allowedBuildings: Object.freeze(['warehouse', 'sawmill', 'charcoal-burners-hut', 'clinic'])
    }),
    trade: Object.freeze({
      id: 'trade', label: 'Trade Village', developmentMultiplier: 1.25,
      matchingResourceBonus: 0, landResourceMultiplier: 0.7,
      allowedBuildings: Object.freeze([
        'warehouse', 'sawmill', 'tannery', 'grain-mill', 'bakery', 'brewery',
        'weavers-workshop', 'tailors-workshop', 'kiln-workshop',
        'carpenters-workshop', 'paper-mill', 'clinic'
      ])
    }),
    military: Object.freeze({
      id: 'military', label: 'Military Village', developmentMultiplier: 1.25,
      matchingResourceBonus: 0, landResourceMultiplier: 0.7,
      allowedBuildings: Object.freeze(['warehouse', 'military-storage', 'ration-kitchen', 'clinic'])
    })
  });

  const footprints = Object.freeze({
    warehouse: 0.2,
    'residential-district': 0.2,
    'charcoal-burners-hut': 0.1667,
    'weavers-workshop': 0.1667,
    'tailors-workshop': 0.1667,
    'ration-kitchen': 0.1667,
    bakery: 0.1667,
    sawmill: 0.25,
    'grain-mill': 0.25,
    tannery: 0.25,
    brewery: 0.25,
    'carpenters-workshop': 0.25,
    'coopers-workshop': 0.3,
    'chandlers-workshop': 0.2,
    cookhouse: 0.3,
    'jewellers-workshop': 0.3,
    'stonecutting-workshop': 0.3333,
    bookbindery: 0.4,
    dairy: 0.4,
    winery: 0.4,
    apothecary: 0.4,
    'bronze-smelter': 0.5,
    'blacksmiths-workshop': 0.5,
    'armourers-workshop': 0.5,
    'weaponsmiths-workshop': 0.5,
    'kiln-workshop': 0.6,
    'paper-mill': 0.6,
    'chemical-workshop': 0.6,
    mint: 0.6,
    glassworks: 0.8,
    smelter: 1,
    stable: 1,
    'siege-workshop': 1.2,
    'town-hall': 0.4,
    chancery: 0.6,
    'local-registry': 0.8,
    ministry: 1.2,
    clinic: 0.6,
    hospital: 1.2,
  });

  const maintenanceRates = Object.freeze({ low: 0.05, medium: 0.08, high: 0.12 });
  const maintenanceClasses = Object.freeze({
    warehouse: 'low',
    'charcoal-burners-hut': 'low',
    'weavers-workshop': 'low',
    'tailors-workshop': 'low',
    sawmill: 'medium',
    'grain-mill': 'medium',
    bakery: 'medium',
    'kiln-workshop': 'medium',
    tannery: 'medium',
    brewery: 'medium',
    'ration-kitchen': 'medium',
    'carpenters-workshop': 'medium',
    'stonecutting-workshop': 'medium',
    'paper-mill': 'medium',
    bookbindery: 'medium',
    'coopers-workshop': 'medium',
    dairy: 'medium',
    'chandlers-workshop': 'low',
    winery: 'medium',
    apothecary: 'medium',
    stable: 'medium',
    cookhouse: 'medium',
    'jewellers-workshop': 'medium',
    'bronze-smelter': 'high',
    'blacksmiths-workshop': 'high',
    'armourers-workshop': 'high',
    'weaponsmiths-workshop': 'high',
    glassworks: 'high',
    smelter: 'high',
    'siege-workshop': 'high',
    'chemical-workshop': 'high',
    mint: 'high',
    'town-hall': 'low',
    chancery: 'low',
    'local-registry': 'medium',
    ministry: 'medium',
    clinic: 'medium',
    hospital: 'high',
  });

  namespace.developmentData = Object.freeze({
    settlementLevels,
    villageSpecialties,
    specialtyResources,
    footprints,
    maintenanceRates,
    maintenanceClasses,
    priorities: Object.freeze(['high', 'normal', 'low']),
    toolModes: Object.freeze(['best-available', 'simple-only', 'bronze-only', 'no-tools']),
    economicTools: Object.freeze({
      simple: Object.freeze({ resourceId: 'simple-tools', dailyWear: 1 / 120, multiplier: 1.05, researchId: 'simple-tool-use' }),
      bronze: Object.freeze({ resourceId: 'bronze-tools', dailyWear: 1 / 240, multiplier: 1.15, researchId: 'bronze-working' }),
    }),
  });
})(window.EcoRuler = window.EcoRuler || {});
