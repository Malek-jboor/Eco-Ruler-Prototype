(function initializeState(namespace) {
  function createInitialState() {
    const modelSummary = namespace.models.createModelSummary();
    const generatedMap = namespace.mapGenerator.generateRegionMap({
      mapSize: namespace.data.mapDefaults.mapSize,
      worldShape: namespace.data.mapDefaults.worldShape,
      seed: namespace.data.mapDefaults.seed,
      worldProfile: namespace.data.mapDefaults.worldProfile,
      clusterStrength: namespace.data.mapDefaults.clusterStrength
    });

    return {
      meta: {
        version: '0.1.0-day-6-water',
        buildLabel: 'Water Provinces And World Shapes'
      },
      modelSummary,
      clock: {
        day: 1,
        season: 'Spring',
        year: 1,
        speed: 'Paused'
      },
      map: generatedMap,
      player: {
        civilization: 'Unselected',
        cities: [],
        outposts: [],
        armies: []
      },
      storage: namespace.models.createResourceStockpile(),
      log: [
        'Prototype shell initialized.',
        `Core data models loaded: ${modelSummary.terrainTypes} terrain types, ${modelSummary.resourceTypes} resources, ${modelSummary.naturalTraits} natural traits.`,
        `Water map generated: ${generatedMap.summary.totalRegions} total regions, ${generatedMap.summary.landRegions} land, ${generatedMap.summary.waterRegions} water.`,
        'Map tuning now uses size, world shape, climate, seed, and cluster strength.'
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
