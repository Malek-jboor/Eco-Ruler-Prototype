(function initializeSettlementLifecycleData(namespace) {
  const parentTransfer = Object.freeze({
    maxDistance: 3,
    paperPerLocalControl: 40,
    penaltyStages: Object.freeze([
      Object.freeze({ days: 60, satisfaction: -10 }),
      Object.freeze({ days: 60, satisfaction: -5 })
    ])
  });

  const advancementProfiles = Object.freeze({
    'village-town': Object.freeze({
      id: 'village-town', label: 'Village to Town', fromTier: 'village', toTier: 'town',
      population: 2000, satisfaction: 60, effortPercent: 300, durationDays: 120,
      exactParentDistance: 3, countryReservation: 'full-new-demand',
      materials: Object.freeze({ wood: 3578, planks: 828, stone: 1080, clay: 500, 'nails-fittings': 360, paper: 7200 })
    }),
    'town-city': Object.freeze({
      id: 'town-city', label: 'Town to City', fromTier: 'town', toTier: 'city',
      population: 5000, satisfaction: 70, effortPercent: 600, durationDays: 240,
      countryReservation: 'secondary-plus-20', countryReservationAmount: 20,
      materials: Object.freeze({ wood: 4293, planks: 1944, stone: 1440, bricks: 3600, 'roof-tiles': 1080, 'nails-fittings': 1200, glass: 500, paper: 14400 })
    }),
    'capital-metropolis': Object.freeze({
      id: 'capital-metropolis', label: 'Capital City to Metropolis', fromTier: 'city', toTier: 'metropolis',
      population: 15000, satisfaction: 80, effortPercent: 1200, durationDays: 360,
      capitalOnly: true, countryReservation: 'none',
      materials: Object.freeze({ wood: 7000, planks: 3000, stone: 5000, bricks: 7200, 'roof-tiles': 5000, 'nails-fittings': 6000, glass: 3000, 'marble-blocks': 2000, paper: 30000, books: 1200 })
    })
  });

  const downgradeProfiles = Object.freeze({
    'city-town': Object.freeze({
      id: 'city-town', label: 'City to Town', fromTier: 'city', toTier: 'town',
      durationDays: 120, satisfactionPenalty: -10, penaltyDays: 120
    }),
    'metropolis-city': Object.freeze({
      id: 'metropolis-city', label: 'Metropolis to Capital City', fromTier: 'metropolis', toTier: 'city',
      durationDays: 180, satisfactionPenalty: -15, penaltyDays: 120, capitalOnly: true
    })
  });

  namespace.settlementLifecycleData = Object.freeze({
    parentTransfer,
    advancementProfiles,
    downgradeProfiles
  });
})(window.EcoRuler = window.EcoRuler || {});
