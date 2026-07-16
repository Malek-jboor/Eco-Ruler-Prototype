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
        version: '0.1.0-day-4',
        buildLabel: 'Natural Layer Generation'
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
        `Day 4 map generated: ${generatedMap.summary.totalRegions} regions and ${generatedMap.summary.traitBearingRegions} trait-bearing regions.`,
        'Natural layer added: coast, river, lake, oasis, fertility, forest density, and deposit traits.'
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
