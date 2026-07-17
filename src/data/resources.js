(function initializeResources(namespace) {
  const resourceCategories = [
    { id: 'building', label: 'Building Materials' },
    { id: 'industry', label: 'Metals and Industry' },
    { id: 'precious', label: 'Precious and Rare' },
    { id: 'natural', label: 'Natural Food and Trade' },
    { id: 'crop', label: 'Crops' },
    { id: 'animal', label: 'Animals' }
  ];

  const resourceTypes = [
    { id: 'wood', label: 'Wood', category: 'building', role: 'Early construction, fuel, tools' },
    { id: 'stone', label: 'Stone', category: 'building', role: 'Construction, fortifications, metropolis needs' },
    { id: 'clay', label: 'Clay', category: 'building', role: 'Clay housing, early settlement, pottery later' },
    { id: 'marble', label: 'Marble', category: 'building', role: 'Prestige buildings, metropolis, luxury' },
    { id: 'sand', label: 'Sand', category: 'building', role: 'Glass later, simple construction' },

    { id: 'iron', label: 'Iron', category: 'industry', role: 'Iron weapons and armor' },
    { id: 'copper', label: 'Copper', category: 'industry', role: 'Bronze production later' },
    { id: 'tin', label: 'Tin', category: 'industry', role: 'Bronze production later' },
    { id: 'coal', label: 'Coal', category: 'industry', role: 'Smelting, industry, fuel' },
    { id: 'sulfur', label: 'Sulfur', category: 'industry', role: 'Chemistry and advanced warfare later' },

    { id: 'gold', label: 'Gold', category: 'precious', role: 'Wealth, trade, nobles' },
    { id: 'silver', label: 'Silver', category: 'precious', role: 'Currency, trade, luxury' },
    { id: 'diamonds', label: 'Diamonds', category: 'precious', role: 'High luxury, trade, nobles' },
    { id: 'pearls', label: 'Pearls', category: 'precious', role: 'Luxury and trade from oyster beds' },

    { id: 'salt', label: 'Salt', category: 'natural', role: 'Food preservation, trade, simple medicine' },
    { id: 'fish', label: 'Fish', category: 'natural', role: 'Food' },
    { id: 'spices', label: 'Spices', category: 'natural', role: 'Luxury and trade' },

    { id: 'wheat', label: 'Wheat', category: 'crop', role: 'Bread' },
    { id: 'vegetables', label: 'Vegetables', category: 'crop', role: 'Food variety' },
    { id: 'fruit', label: 'Fruit', category: 'crop', role: 'Food, alcohol later' },
    { id: 'cotton', label: 'Cotton', category: 'crop', role: 'Civil clothing, bandages later' },
    { id: 'herbs', label: 'Herbs', category: 'crop', role: 'Medicine later' },
    { id: 'honey', label: 'Honey', category: 'crop', role: 'Food, medicine later' },

    { id: 'cattle', label: 'Cattle', category: 'animal', role: 'Meat, milk, leather', outputs: ['meat', 'milk', 'leather'] },
    { id: 'sheep', label: 'Sheep', category: 'animal', role: 'Wool, meat, little milk', outputs: ['wool', 'meat', 'milk'] },
    { id: 'horses', label: 'Horses', category: 'animal', role: 'Army and transport', outputs: [] },
    { id: 'deer', label: 'Deer', category: 'animal', role: 'Meat, leather', outputs: ['meat', 'leather'] },
    { id: 'foxes', label: 'Foxes', category: 'animal', role: 'Fur only', outputs: ['fur'] }
  ];

  const naturalTraits = [
    { id: 'river', label: 'River', role: 'Improves crops, fish, clay, supply, and can pass through Desert without creating High Fertility.' },
    { id: 'lake', label: 'Lake', role: 'Improves fertility, fish, clay, supply, and special water resources.' },
    { id: 'coast', label: 'Coast', role: 'Opens fish, pearls, salt, and sand through direct adjacency to Ocean.' },
    { id: 'oasis', label: 'Oasis', role: 'Allows limited Desert farming, spices, cotton, and local supply.' },
    { id: 'high-fertility', label: 'High Fertility', role: 'Improves agricultural and animal output; never appears in Mountains, Desert, or Ocean.' },
    { id: 'forest-density', label: 'Forest Density', role: 'Richer forest cover that improves wood, herbs, honey, deer, foxes, defense, and slows movement.' },
    { id: 'mineral-vein', label: 'Mineral Vein', role: 'Opens or improves iron, copper, tin, and coal.' },
    { id: 'precious-vein', label: 'Precious Vein', role: 'Opens or improves gold and silver.' },
    { id: 'gem-vein', label: 'Gem Vein', role: 'Opens or improves diamonds.' },
    { id: 'volcanic', label: 'Volcanic Trait', role: 'Opens or improves sulfur and can slightly improve precious metals.' },
    { id: 'god-bless', label: 'God Bless', role: 'Rare blessing that adds +100% to primary resource production only.' }
  ];

  const traitLabelToId = Object.freeze({
    'River': 'river',
    'Lake': 'lake',
    'Coast': 'coast',
    'Oasis': 'oasis',
    'High Fertility': 'high-fertility',
    'Forest Density': 'forest-density',
    'Mineral Vein': 'mineral-vein',
    'Precious Vein': 'precious-vein',
    'Gem Vein': 'gem-vein',
    'Volcanic Trait': 'volcanic',
    'God Bless': 'god-bless'
  });

  const resourceLabelToId = Object.freeze({
    Wood: 'wood',
    Stone: 'stone',
    Clay: 'clay',
    Marble: 'marble',
    Sand: 'sand',
    Iron: 'iron',
    Copper: 'copper',
    Tin: 'tin',
    Coal: 'coal',
    Sulfur: 'sulfur',
    Gold: 'gold',
    Silver: 'silver',
    Diamonds: 'diamonds',
    Oysters: 'pearls',
    Pearls: 'pearls',
    Salt: 'salt',
    Fish: 'fish',
    Spices: 'spices',
    Wheat: 'wheat',
    Vegetables: 'vegetables',
    Fruit: 'fruit',
    Cotton: 'cotton',
    Herbs: 'herbs',
    Honey: 'honey',
    Cattle: 'cattle',
    Sheep: 'sheep',
    Horses: 'horses',
    Deer: 'deer',
    Foxes: 'foxes'
  });

  function indexById(items) {
    return items.reduce((result, item) => {
      result[item.id] = item;
      return result;
    }, {});
  }

  function rule(terrainId, resourceId, baseEfficiency, requiredTraits = []) {
    return {
      terrainId,
      resourceId,
      baseEfficiency,
      requiredTraits,
      access: requiredTraits.length ? 'conditional' : 'direct'
    };
  }

  const resourceTerrainRules = [
    rule('mountains', 'wood', 0.2, ['forest-density']),
    rule('mountains', 'stone', 0.9),
    rule('mountains', 'marble', 0.8),
    rule('mountains', 'iron', 0.5, ['mineral-vein']),
    rule('mountains', 'copper', 0.5, ['mineral-vein']),
    rule('mountains', 'tin', 0.5, ['mineral-vein']),
    rule('mountains', 'coal', 0.5, ['mineral-vein']),
    rule('mountains', 'sulfur', 0.5, ['volcanic']),
    rule('mountains', 'gold', 0.3, ['precious-vein', 'volcanic']),
    rule('mountains', 'silver', 0.3, ['precious-vein', 'volcanic']),
    rule('mountains', 'diamonds', 0.3, ['gem-vein', 'volcanic']),
    rule('mountains', 'fish', 0.5, ['coast', 'river', 'lake']),
    rule('mountains', 'herbs', 0.2, ['forest-density']),
    rule('mountains', 'honey', 0.2, ['forest-density']),
    rule('mountains', 'deer', 0.2, ['forest-density']),

    rule('hills', 'wood', 0.2, ['forest-density']),
    rule('hills', 'stone', 0.5),
    rule('hills', 'clay', 0.5, ['river', 'lake']),
    rule('hills', 'iron', 0.05, ['mineral-vein']),
    rule('hills', 'copper', 0.05, ['mineral-vein']),
    rule('hills', 'tin', 0.05, ['mineral-vein']),
    rule('hills', 'coal', 0.05, ['mineral-vein']),
    rule('hills', 'sulfur', 0.5, ['volcanic']),
    rule('hills', 'fish', 0.5, ['coast', 'river', 'lake']),
    rule('hills', 'wheat', 0.5),
    rule('hills', 'vegetables', 0.5),
    rule('hills', 'fruit', 0.5),
    rule('hills', 'cotton', 0.2, ['river', 'lake']),
    rule('hills', 'honey', 0.5, ['forest-density']),
    rule('hills', 'sheep', 0.5),
    rule('hills', 'horses', 0.5),

    rule('plains', 'wood', 0.3, ['forest-density']),
    rule('plains', 'clay', 0.75, ['river', 'lake']),
    rule('plains', 'pearls', 0.3, ['coast']),
    rule('plains', 'salt', 0.6, ['coast']),
    rule('plains', 'fish', 0.5, ['coast', 'river', 'lake']),
    rule('plains', 'spices', 0.1, ['coast', 'river', 'lake']),
    rule('plains', 'wheat', 0.8),
    rule('plains', 'vegetables', 0.8),
    rule('plains', 'fruit', 0.8),
    rule('plains', 'cotton', 0.6),
    rule('plains', 'herbs', 0.7),
    rule('plains', 'honey', 0.6),
    rule('plains', 'cattle', 1),
    rule('plains', 'sheep', 1),
    rule('plains', 'horses', 1),
    rule('plains', 'deer', 0.2, ['forest-density']),
    rule('plains', 'foxes', 0.2, ['forest-density']),

    rule('forests', 'wood', 0.7),
    rule('forests', 'clay', 0.5, ['river', 'lake']),
    rule('forests', 'pearls', 0.15, ['coast']),
    rule('forests', 'salt', 0.5, ['coast']),
    rule('forests', 'fish', 0.4, ['coast', 'river', 'lake']),
    rule('forests', 'herbs', 0.8),
    rule('forests', 'honey', 0.8),
    rule('forests', 'deer', 0.8),
    rule('forests', 'foxes', 0.8),

    rule('desert', 'sand', 1),
    rule('desert', 'pearls', 0.5, ['coast']),
    rule('desert', 'salt', 0.65, ['coast']),
    rule('desert', 'fish', 0.5, ['coast', 'river', 'lake']),
    rule('desert', 'spices', 0.8, ['river', 'oasis']),
    rule('desert', 'cotton', 0.6, ['river', 'oasis']),

    rule('swamps', 'wood', 0.3, ['forest-density']),
    rule('swamps', 'clay', 1),
    rule('swamps', 'pearls', 0.3, ['coast']),
    rule('swamps', 'salt', 0.65, ['coast']),
    rule('swamps', 'fish', 0.5, ['coast', 'river', 'lake']),
    rule('swamps', 'cotton', 0.6),
    rule('swamps', 'herbs', 0.3, ['forest-density']),
    rule('swamps', 'honey', 0.25, ['forest-density']),
    rule('swamps', 'deer', 0.25, ['forest-density']),
    rule('swamps', 'foxes', 0.25, ['forest-density'])
  ];

  const resourceTraitEffects = Object.freeze({
    wheat: { river: 0.2, lake: 0.15, oasis: 0.1, 'high-fertility': 0.25, 'god-bless': 1 },
    vegetables: { river: 0.2, lake: 0.15, oasis: 0.1, 'high-fertility': 0.25, 'god-bless': 1 },
    fruit: { river: 0.2, lake: 0.15, oasis: 0.1, 'high-fertility': 0.25, 'forest-density': 0.05, 'god-bless': 1 },
    cotton: { river: 0.2, lake: 0.15, oasis: 0.2, 'high-fertility': 0.25, 'god-bless': 1 },
    herbs: { river: 0.1, lake: 0.1, oasis: 0.1, 'high-fertility': 0.25, 'forest-density': 0.2, 'god-bless': 1 },
    honey: { river: 0.1, lake: 0.2, 'high-fertility': 0.15, 'forest-density': 0.25, 'god-bless': 1 },
    wood: { 'forest-density': 0.3, 'god-bless': 1 },
    fish: { river: 0.1, lake: 0.3, coast: 0.5, oasis: 0.1, 'god-bless': 1 },
    clay: { river: 0.25, lake: 0.25, 'god-bless': 1 },
    sand: { coast: 0.3, oasis: 0.2, 'god-bless': 1 },
    salt: { coast: 0.35, oasis: 0.35, 'god-bless': 1 },
    pearls: { coast: 0.5, 'god-bless': 1 },
    iron: { 'mineral-vein': 0.5, 'god-bless': 1 },
    copper: { 'mineral-vein': 0.5, 'god-bless': 1 },
    tin: { 'mineral-vein': 0.5, 'god-bless': 1 },
    coal: { 'mineral-vein': 0.5, 'god-bless': 1 },
    gold: { 'precious-vein': 0.5, volcanic: 0.05, 'god-bless': 1 },
    silver: { 'precious-vein': 0.5, volcanic: 0.05, 'god-bless': 1 },
    diamonds: { 'gem-vein': 0.75, 'god-bless': 1 },
    sulfur: { volcanic: 0.75, 'god-bless': 1 },
    stone: { 'god-bless': 1 },
    marble: { 'god-bless': 1 },
    spices: { river: 0.2, oasis: 0.2, 'god-bless': 1 },
    cattle: { river: 0.1, lake: 0.1, 'high-fertility': 0.12, 'god-bless': 1 },
    sheep: { river: 0.1, lake: 0.1, 'high-fertility': 0.1, 'god-bless': 1 },
    horses: { river: 0.1, lake: 0.1, 'high-fertility': 0.1, 'god-bless': 1 },
    deer: { lake: 0.05, 'high-fertility': 0.05, 'forest-density': 0.25, 'god-bless': 1 },
    foxes: { 'forest-density': 0.25, 'god-bless': 1 }
  });

  const regionalTraitEffects = Object.freeze({
    settlement: { river: 0.1, lake: 0.1, coast: 0.06, oasis: 0.12, 'high-fertility': 0.15, 'forest-density': 0.04, 'mineral-vein': 0.08, 'precious-vein': 0.12, 'gem-vein': 0.12, volcanic: -0.05, 'god-bless': 0 },
    supply: { river: 0.08, lake: 0.08, coast: 0.06, oasis: 0.1, 'high-fertility': 0.1, 'forest-density': 0.02, volcanic: -0.03, 'god-bless': 0 },
    movement: { river: -0.03, lake: -0.03, coast: 0.02, 'forest-density': -0.08, volcanic: -0.08, 'god-bless': 0 },
    defense: { river: 0.03, lake: 0.03, coast: 0.02, oasis: 0.02, 'forest-density': 0.08, 'mineral-vein': 0.03, 'precious-vein': 0.03, 'gem-vein': 0.03, volcanic: 0.04, 'god-bless': 0 }
  });

  function hasAnyTrait(traitSet, requiredTraits) {
    return requiredTraits.length === 0 || requiredTraits.some((traitId) => traitSet.has(traitId));
  }

  function effectForTraits(resourceId, traitSet) {
    const effects = resourceTraitEffects[resourceId] || {};
    const activeEffects = Object.entries(effects)
      .filter(([traitId, value]) => value !== 0 && traitSet.has(traitId))
      .map(([traitId, value]) => ({ traitId, value }));
    const bonus = activeEffects.reduce((sum, effect) => sum + effect.value, 0);
    return { bonus, activeEffects };
  }

  function missingTraitsFor(ruleConfig, traitSet) {
    return ruleConfig.requiredTraits.filter((traitId) => !traitSet.has(traitId));
  }

  function candidateSort(first, second) {
    if (first.available !== second.available) return first.available ? -1 : 1;
    if (first.finalEfficiency !== second.finalEfficiency) return second.finalEfficiency - first.finalEfficiency;
    return first.resourceId.localeCompare(second.resourceId);
  }

  function getResourceCandidates(terrainId, traits = []) {
    const traitSet = new Set(traits);
    return resourceTerrainRules
      .filter((ruleConfig) => ruleConfig.terrainId === terrainId)
      .map((ruleConfig) => {
        const available = hasAnyTrait(traitSet, ruleConfig.requiredTraits);
        const effect = effectForTraits(ruleConfig.resourceId, traitSet);
        const finalEfficiency = available ? ruleConfig.baseEfficiency + effect.bonus : 0;
        return {
          terrainId: ruleConfig.terrainId,
          resourceId: ruleConfig.resourceId,
          access: ruleConfig.access,
          available,
          baseEfficiency: ruleConfig.baseEfficiency,
          traitBonus: available ? effect.bonus : 0,
          finalEfficiency,
          requiredTraits: [...ruleConfig.requiredTraits],
          missingTraits: available ? [] : missingTraitsFor(ruleConfig, traitSet),
          activeEffects: available ? effect.activeEffects : []
        };
      })
      .sort(candidateSort);
  }

  namespace.resources = Object.freeze({
    resourceCategories,
    resourceTypes,
    resourceById: Object.freeze(indexById(resourceTypes)),
    naturalTraits,
    naturalTraitById: Object.freeze(indexById(naturalTraits)),
    traitLabelToId,
    resourceLabelToId,
    resourceTerrainRules,
    resourceTraitEffects,
    regionalTraitEffects,
    getResourceCandidates
  });
})(window.EcoRuler = window.EcoRuler || {});
