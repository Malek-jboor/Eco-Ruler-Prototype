(function initializeExpansionData(namespace) {
  const FOOD_SHARES = Object.freeze({ bread: 0.45, protein: 0.25, vegetables: 0.2, fruit: 0.1 });
  const PROTEIN_RESOURCES = Object.freeze(['meat', 'fish', 'milk']);
  const OUTPOST_FOUNDING_BASE_MATERIALS = Object.freeze({
    wood: 636,
    planks: 180,
    stone: 80,
    'nails-fittings': 100
  });
  const foundingByDistance = Object.freeze({
    1: Object.freeze({ distance: 1, effort: 1 / 3, durationDays: 15, food: 200 }),
    2: Object.freeze({ distance: 2, effort: 2 / 3, durationDays: 30, food: 400 }),
    3: Object.freeze({ distance: 3, effort: 1, durationDays: 45, food: 600 })
  });
  function foundingMaterials(distance) {
    const multiplier = Math.max(1, Math.min(3, Math.floor(Number(distance) || 1)));
    return Object.freeze(Object.entries(OUTPOST_FOUNDING_BASE_MATERIALS).reduce((result, [resourceId, amount]) => {
      result[resourceId] = amount * multiplier;
      return result;
    }, {}));
  }
  const conversionProfiles = Object.freeze({
    village: Object.freeze({
      id: 'village', label: 'Convert to Village', effort: 1, durationDays: 120, founderHousing: 500,
      materials: Object.freeze({ wood: 1431, planks: 432, stone: 180, bricks: 480, 'nails-fittings': 300 })
    }),
    town: Object.freeze({
      id: 'town', label: 'Convert to Town', effort: 4, durationDays: 240, founderHousing: 1200,
      materials: Object.freeze({ wood: 6011, planks: 1512, stone: 1512, clay: 600, bricks: 576, 'nails-fittings': 792, paper: 8640 })
    })
  });
  namespace.expansionData = Object.freeze({
    MAX_OUTPOST_POPULATION_FROM_SETTLERS: 500,
    OUTPOST_FOUNDING_SETTLERS: 50,
    TRAVEL_DAYS_PER_PROVINCE: 40,
    FOOD_PER_PERSON_PER_PROVINCE: 4,
    FOOD_SHARES,
    PROTEIN_RESOURCES,
    OUTPOST_FOUNDING_BASE_MATERIALS,
    foundingMaterials,
    foundingByDistance,
    conversionProfiles
  });
})(window.EcoRuler = window.EcoRuler || {});
