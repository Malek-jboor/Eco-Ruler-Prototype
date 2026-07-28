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
        version: '0.1.0-task-39-health-population',
        buildLabel: 'Health, Population And Storage Reservations'
      },
      modelSummary,
      clock: {
        day: 1,
        season: 'Spring',
        year: 1,
        speed: 0,
        previousSpeed: 1,
        elapsedRealMs: 0,
        processedDays: 0
      },
      economy: {
        settlementFood: {},
        clothesCoverage: null,
        shortageEpisode: null,
        harvestHistory: [],
        productionHistory: [],
        satisfaction: { stateVersion: 1, lastDay: null },
        health: { stateVersion: 1, lastDay: null }
      },
      alerts: [],
      nextAlertNumber: 1,
      administration: {
        founderCountryRetired: false,
        founderLocalRetired: false,
        countryRequests: {},
        producedCountry: 0,
        producedLocalByCenter: {},
        alertIds: {},
        countryReservations: {},
        localReservations: {}
      },
      expansion: {
        nextOrderNumber: 1,
        settlerOrders: []
      },
      map: generatedMap,
      startSeed: namespace.data.mapDefaults.startSeed,
      mapViewport: { x: 0, y: 0, zoom: 1 },
      player: {
        civilization: 'Unselected',
        gameStarted: false,
        realm: {
          id: 'player',
          name: 'Player Realm',
          color: '#d9468f'
        },
        research: {
          completed: []
        },
        capitalSettlementId: null,
        capitalId: null,
        settlementStateVersion: 1,
        startingVillageSetup: null,
        cities: [],
        outposts: [],
        armies: []
      },
      storage: namespace.storageLedger.createLedger(),
      nextResourceSiteOrder: 0,
      nextProcessingBuildingOrder: 0,
      nextAdministrativeBuildingOrder: 0,
      nextMedicalBuildingOrder: 0,
      nextDevelopmentLevelOrder: 0,
      nextLifecycleOrder: 0,
      treasury: {
        balance: null,
        status: 'Deferred until fixed prices are approved.'
      },
      log: [
        'Prototype shell initialized.',
        `Core data models loaded: ${modelSummary.terrainTypes} terrain types, ${modelSummary.resourceTypes} resources, ${modelSummary.naturalTraits} natural traits.`,
        `Water map generated: ${generatedMap.summary.totalRegions} total regions, ${generatedMap.summary.landRegions} land, ${generatedMap.summary.waterRegions} water.`,
        'Map tuning now uses size, world shape, climate, seed, and cluster strength.',
        'Day 8 resources are approved and listed by category.',
        'Day 9 natural traits now use God Bless instead of Rich Deposit.',
        'Day 10 region resource candidates and additive efficiency are calculated from the approved spreadsheet.',
        'Map view supports mouse-wheel zoom and drag panning.',
        'Day 12 Work Slot 1 can choose any eligible province resource through the Production tab Build action; later slots stay locked until city rules.',
        'Day 13 rare resources now use stricter gates: gold and silver need Precious Vein, diamonds need Gem Vein, sulfur needs Volcanic Trait, and pearls need rare coastal Oyster Bed.',
        'Day 14 rare strategic provinces now show compact map markers for Gold, Silver, Diamonds, Sulfur, Pearls, and God Bless.',
        'Task 15 manual founding has been replaced by Start Game auto-founding.',
        'Task 16 Resource Sites replace direct resource-pick wording with placeholder mines, farms, pastures, camps, and gathering sites.',
        'Task 17 adds automatic starting city placement, Player Realm claim color, fog of war, and prototype outpost building.',
        'Task 18 splits map simulation and UI behavior into focused modules without changing gameplay.',
        'Task 19 adds developer-only quick and deep automated map validation.',
        'Task 20 adds polygon-based province area, Resource Capacity, water capacity, abundance, and deterministic Natural Potential.',
        'The corrected new-game baseline uses 15,000 founding Storage Points and loads the approved Founder Reserve when Start Game begins.',
        'Tasks 22-24 add province construction queues, expandable Resource Sites, worker caps, and output previews.',
        'Week 3 economy work adds deterministic time, Outpost operation, finite stock production, harvests, consumption, and spoilage.',
        'Tasks 28-29 add deterministic multi-product manufacturing and the approved Tier 1 processing buildings and recipes.',
        'Task 30 adds Development Capacity, footprints, material maintenance, economic-tool allocation, and tool wear.',
        'Task 31 reconciles canonical production, extraction, construction, footprint, location, and storage data.',
        'Task 32 adds the approved navigation and settlement-state migration foundation.',
        'Tasks 33-34 add area capacity, Village specialties, and realm Workforce Priority.',
        'Task 35 adds Country Control, Local Control, and administrative offices.',
        'Task 36 adds paid Outpost founding, settler travel, conversion, and dismantling.',
        'Task 37 adds Village-parent transfer, settlement advancement and downgrade projects, housing quality, and tiered Warehouses.',
        'Task 38 adds Satisfaction, Living Standards, Local Watch, Religious Services, and daily civilian allocations.',
        'Task 39 adds Health, medical facilities and distributions, deterministic demographics, and Warehouse storage reservations.',
        'New realms begin with a State Capital and require two adjacent starting Village choices before time can run.'
      ]
    };
  }

  namespace.createInitialState = createInitialState;
})(window.EcoRuler = window.EcoRuler || {});
