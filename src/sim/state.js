(function initializeState(namespace) {
  function createInitialState() {
    const modelSummary = namespace.models.createModelSummary();

    return {
      meta: {
        version: "0.1.0-day-2",
        buildLabel: "Core Data Models"
      },
      modelSummary,
      clock: {
        day: 1,
        season: "Spring",
        year: 1,
        speed: "Paused"
      },
      map: {
        seed: "not-generated-yet",
        regions: [],
        selectedRegionId: null
      },
      player: {
        civilization: "Unselected",
        cities: [],
        outposts: [],
        armies: []
      },
      storage: namespace.models.createResourceStockpile(),
      log: [
        "Prototype shell initialized.",
        `Core data models loaded: ${modelSummary.terrainTypes} terrain types, ${modelSummary.resourceTypes} resources, ${modelSummary.naturalTraits} natural traits.`,
        "Day 2 target: region, resource, production slot, city, and outpost models exist in code."
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
