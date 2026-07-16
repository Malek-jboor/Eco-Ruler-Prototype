(function initializeState(namespace) {
  function createInitialState() {
    const modelSummary = namespace.models.createModelSummary();
    const generatedMap = namespace.mapGenerator.generateRegionMap({
      width: namespace.data.mapDefaults.width,
      height: namespace.data.mapDefaults.height,
      seed: namespace.data.mapDefaults.seed,
      clusterStrength: namespace.data.mapDefaults.clusterStrength,
      terrainWeights: namespace.data.mapDefaults.terrainWeights
    });

    return {
      meta: {
        version: '0.1.0-day-3',
        buildLabel: 'Temporary Map Generation'
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
        `Day 3 map generated: ${generatedMap.summary.totalRegions} regions from seed ${generatedMap.seed}.`,
        `Cluster strength set to ${generatedMap.clusterStrength}: terrain groups prefer nearby compatible regions.`
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
