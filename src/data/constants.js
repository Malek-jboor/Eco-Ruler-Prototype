(function initializeConstants(namespace) {
  const terrainTypes = [
    { id: 'mountains', label: 'Mountains', color: '#7a7f73', isWater: false },
    { id: 'hills', label: 'Hills', color: '#9a8f5d', isWater: false },
    { id: 'plains', label: 'Plains', color: '#8fb565', isWater: false },
    { id: 'forests', label: 'Forests', color: '#3f7d57', isWater: false },
    { id: 'desert', label: 'Desert', color: '#c49a58', isWater: false },
    { id: 'swamps', label: 'Swamps', color: '#587f78', isWater: false },
    { id: 'ocean', label: 'Ocean', color: '#4f8ead', isWater: true }
  ];

  const landTerrainIds = terrainTypes.filter((terrain) => !terrain.isWater).map((terrain) => terrain.id);

  const worldProfiles = [
    { id: 'temperate', label: 'Temperate', description: 'Balanced climate with extra plains and stable settlement land.' },
    { id: 'arid', label: 'Arid', description: 'Dry world with more desert, dry hills, and fewer forests or swamps.' },
    { id: 'humid', label: 'Humid', description: 'Wet world with more plains, forests, and limited extra swamps.' },
    { id: 'cold', label: 'Cold', description: 'Harsh northern world with more mountains, hills, and fewer deserts.' }
  ];

  const worldShapes = [
    { id: 'pangea', label: 'Pangea', description: 'One connected landmass surrounded by ocean.' },
    { id: 'continental', label: 'Continental', description: 'Two uneven main landmasses with smaller surrounding islands.' },
    { id: 'islands', label: 'Islands', description: 'Varied island sizes with many tiny satellite islands and ocean channels.' }
  ];

  const mapSizes = [
    { id: 'small', label: 'Small', width: 16, height: 10, totalRegions: 160 },
    { id: 'medium', label: 'Medium', width: 20, height: 12, totalRegions: 240 },
    { id: 'large', label: 'Large', width: 24, height: 15, totalRegions: 360 }
  ];

  const prototypeMilestone = {
    name: 'Prototype 0.1',
    day: 6,
    focus: 'Water provinces and world shapes',
    scope: [
      'Map generation',
      'Resources',
      'Extraction',
      'Simple manufacturing',
      'Army creation without battles'
    ]
  };

  const timeScale = {
    seasonLengthDays: 30,
    seasonsPerYear: 4,
    normalSecondsPerDay: 10
  };

  const mapDefaults = {
    mapSize: 'small',
    worldShape: 'pangea',
    width: 16,
    height: 10,
    seed: 'eco-ruler-day-6-water',
    worldProfile: 'temperate',
    clusterStrength: 60,
    terrainWeights: {
      mountains: 16,
      hills: 14,
      plains: 24,
      forests: 22,
      desert: 14,
      swamps: 10
    }
  };

  namespace.data = Object.freeze({
    terrainTypes,
    landTerrainIds,
    worldProfiles,
    worldShapes,
    mapSizes,
    prototypeMilestone,
    timeScale,
    mapDefaults
  });
})(window.EcoRuler = window.EcoRuler || {});
