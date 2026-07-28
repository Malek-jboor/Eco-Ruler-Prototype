(function initializeHealthData(namespace) {
  const DAYS_PER_YEAR = 120;

  function construction(footprint, effort, days, maintenancePercent, materials) {
    return Object.freeze({
      footprint,
      effort,
      cashPercent: null,
      days,
      maintenancePercent,
      materials: Object.freeze({ ...materials })
    });
  }

  function facility(id, label, locations, populationCapacity, workers, profile) {
    return Object.freeze({
      id,
      label,
      category: 'medical',
      locations: Object.freeze([...locations]),
      populationCapacity,
      workers,
      construction: profile,
      usesEconomicTools: false
    });
  }

  const medicalProducts = Object.freeze([
    Object.freeze({ id: 'bandages', label: 'Bandages', points: 4 }),
    Object.freeze({ id: 'treated-bandages', label: 'Treated Bandages', points: 6 }),
    Object.freeze({ id: 'healing-salve', label: 'Healing Salve', points: 4 }),
    Object.freeze({ id: 'herbal-medicine', label: 'Herbal Medicine', points: 6 })
  ]);

  const facilityDefinitions = Object.freeze({
    clinic: facility(
      'clinic', 'Clinic', ['village', 'town', 'city', 'capital'], 1000, 40,
      construction(0.6, 1.5, 180, 8, {
        wood: 1074, planks: 486, stone: 360, bricks: 900,
        'roof-tiles': 270, 'nails-fittings': 300, glass: 100
      })
    ),
    hospital: facility(
      'hospital', 'Hospital', ['city', 'capital'], 3000, 100,
      construction(1.2, 3, 360, 12, {
        wood: 2500, planks: 1200, stone: 1800, bricks: 3000,
        'roof-tiles': 2000, 'nails-fittings': 1800, glass: 1000,
        'marble-blocks': 500
      })
    )
  });

  namespace.healthData = Object.freeze({
    DAYS_PER_YEAR,
    INITIAL_HEALTH: 50,
    DAILY_INCREASE: 0.25,
    DAILY_DECREASE: 0.5,
    CLOTHING_PER_PERSON_PER_LAYER: 1 / 1200,
    MEDICAL_PRODUCT_PER_COVERED_PERSON: 1 / 1200,
    BIRTH_BASE_RATE: 0.02,
    BIRTH_SATISFACTION_RATE: 0.0008,
    DEATH_BASE_RATE: 0.05,
    medicalProducts,
    medicalProductById: Object.freeze(Object.fromEntries(medicalProducts.map((item) => [item.id, item]))),
    facilityDefinitions,
    facilityList: Object.freeze(Object.values(facilityDefinitions))
  });
})(window.EcoRuler = window.EcoRuler || {});
