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
        version: '0.1.0-day-10-resource-candidates',
        buildLabel: 'Natural Traits And Resource Candidates'
      },
      modelSummary,
      clock: {
        day: 1,
        season: 'Spring',
        year: 1,
        speed: 'Paused'
      },
      map: generatedMap,
      mapViewport: { x: 0, y: 0, zoom: 1 },
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
        'Map tuning now uses size, world shape, climate, seed, and cluster strength.',
        'Day 8 resources are approved and listed by category.',
        'Day 9 natural traits now use God Bless instead of Rich Deposit.',
        'Day 10 region resource candidates and additive efficiency are calculated from the approved spreadsheet.',
        'Map view supports mouse-wheel zoom and drag panning.'
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
