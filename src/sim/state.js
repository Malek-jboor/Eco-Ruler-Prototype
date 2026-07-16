(function initializeState(namespace) {
  function createInitialState() {
    return {
      meta: {
        version: "0.1.0-day-1",
        buildLabel: "Prototype Shell"
      },
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
      storage: {},
      log: [
        "Prototype shell initialized.",
        "Day 1 target: app opens locally and shows the empty prototype screen."
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
