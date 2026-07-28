(function initializeSatisfactionData(namespace) {
  const foodCategories = Object.freeze([
    Object.freeze({ id: 'bread', label: 'Bread', share: 0.45, resources: Object.freeze(['bread']) }),
    Object.freeze({ id: 'protein', label: 'Protein', share: 0.25, resources: Object.freeze(['meat', 'fish', 'butter', 'cheese', 'spiced-meat']) }),
    Object.freeze({ id: 'vegetables', label: 'Vegetables', share: 0.2, resources: Object.freeze(['vegetables']) }),
    Object.freeze({ id: 'fruit', label: 'Fruit', share: 0.1, resources: Object.freeze(['fruit']) })
  ]);

  const drinkLevels = Object.freeze({
    none: Object.freeze({ id: 'none', label: 'None', dailyPerPerson: 0, points: 0 }),
    low: Object.freeze({ id: 'low', label: 'Low', dailyPerPerson: 0.01, points: 2 }),
    normal: Object.freeze({ id: 'normal', label: 'Normal', dailyPerPerson: 0.02, points: 4 }),
    generous: Object.freeze({ id: 'generous', label: 'Generous', dailyPerPerson: 0.03, points: 6 })
  });

  namespace.satisfactionData = Object.freeze({
    INITIAL_SATISFACTION: 60,
    DAILY_INCREASE: 0.5,
    DAILY_DECREASE: 1,
    FOOD_PER_MEAL_PER_PERSON: 0.1,
    CLOTHING_PER_PERSON: 1 / 1200,
    RESERVE_DAYS_CAP: 240,
    foodCategories,
    clothingResources: Object.freeze(['simple-clothes', 'normal-clothes', 'luxury-clothes']),
    drinkResources: Object.freeze(['liquor', 'wine', 'spiced-wine']),
    drinkLevels,
    drinkLevelList: Object.freeze(Object.values(drinkLevels)),
    serviceDefinitions: Object.freeze({
      'local-watch': Object.freeze({
        id: 'local-watch',
        label: 'Local Watch',
        populationPerWorker: 100,
        points: 10
      }),
      'religious-services': Object.freeze({
        id: 'religious-services',
        label: 'Religious Services',
        populationPerWorker: 200,
        points: 7
      })
    })
  });
})(window.EcoRuler = window.EcoRuler || {});
