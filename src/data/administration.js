(function initializeAdministrationData(namespace) {
  const FOUNDER_COUNTRY_CONTROL = 50;
  const FOUNDER_LOCAL_CONTROL = 150;

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

  function office(id, label, locations, workers, inputs, controlType, baseOutput, bookBonus, profile) {
    return Object.freeze({
      id,
      label,
      category: 'administrative',
      locations: Object.freeze([...locations]),
      workers,
      inputs: Object.freeze({ ...inputs }),
      controlType,
      baseOutput,
      bookBonus,
      construction: profile,
      usesEconomicTools: false
    });
  }

  const urban = Object.freeze(['town', 'city', 'capital']);
  const capital = Object.freeze(['capital']);
  const officeDefinitions = Object.freeze({
    'town-hall': office(
      'town-hall', 'Town Hall', urban, 40, { paper: 20 }, 'local', 25, 0,
      construction(0.4, 1, 120, 5, {
        wood: 954, planks: 324, stone: 240, bricks: 720, 'nails-fittings': 300
      })
    ),
    chancery: office(
      'chancery', 'Chancery', capital, 50, { paper: 40 }, 'country', 25, 0,
      construction(0.6, 1.5, 180, 5, {
        wood: 1074, planks: 486, stone: 450, bricks: 1080, 'nails-fittings': 450
      })
    ),
    'local-registry': office(
      'local-registry', 'Local Registry', urban, 80, { paper: 40, books: 5 }, 'local', 50, 50,
      construction(0.8, 2, 240, 8, {
        wood: 954, planks: 432, stone: 240, bricks: 960, 'roof-tiles': 360,
        glass: 60, 'marble-blocks': 90, 'nails-fittings': 400
      })
    ),
    ministry: office(
      'ministry', 'Ministry', capital, 100, { paper: 80, books: 10 }, 'country', 50, 50,
      construction(1.2, 3, 360, 8, {
        wood: 1145, planks: 648, stone: 432, bricks: 1440, 'roof-tiles': 540,
        glass: 150, 'marble-blocks': 400, 'nails-fittings': 600
      })
    )
  });

  const countryTierBase = Object.freeze({ town: 20, city: 40, metropolis: 40 });
  const localDemand = Object.freeze({
    agricultural: Object.freeze({ 1: 10, 2: 20, 3: 30 }),
    extractive: Object.freeze({ 1: 20, 2: 30, 3: 40 }),
    trade: Object.freeze({ 1: 30, 2: 40, 3: 50 }),
    military: Object.freeze({ 1: 30, 2: 40, 3: 50 })
  });

  namespace.administrationData = Object.freeze({
    FOUNDER_COUNTRY_CONTROL,
    FOUNDER_LOCAL_CONTROL,
    countryTierBase,
    localDemand,
    officeDefinitions,
    officeList: Object.freeze(Object.values(officeDefinitions))
  });
})(window.EcoRuler = window.EcoRuler || {});
