(function initializeConstants(namespace) {
  const terrainTypes = [
    { id: 'mountains', label: 'Mountains', color: '#7a7f73' },
    { id: 'hills', label: 'Hills', color: '#9a8f5d' },
    { id: 'plains', label: 'Plains', color: '#8fb565' },
    { id: 'forests', label: 'Forests', color: '#3f7d57' },
    { id: 'desert', label: 'Desert', color: '#c49a58' },
    { id: 'swamps', label: 'Swamps', color: '#587f78' }
  ];

  const prototypeMilestone = {
    name: 'Prototype 0.1',
    day: 2,
    focus: 'Core data models',
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

  namespace.data = Object.freeze({ terrainTypes, prototypeMilestone, timeScale });
})(window.EcoRuler = window.EcoRuler || {});
