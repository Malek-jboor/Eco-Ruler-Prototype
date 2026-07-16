(function initializeResources(namespace) {
  const resourceCategories = [
    { id: "building", label: "Building Materials" },
    { id: "industry", label: "Metals and Industry" },
    { id: "precious", label: "Precious and Rare" },
    { id: "natural", label: "Natural Food and Trade" },
    { id: "crop", label: "Crops" },
    { id: "animal", label: "Animals" }
  ];

  const resourceTypes = [
    { id: "wood", label: "Wood", category: "building", role: "Early construction, fuel, tools" },
    { id: "stone", label: "Stone", category: "building", role: "Construction, fortifications, metropolis needs" },
    { id: "clay", label: "Clay", category: "building", role: "Clay housing, early settlement, pottery later" },
    { id: "marble", label: "Marble", category: "building", role: "Prestige buildings, metropolis, luxury" },
    { id: "sand", label: "Sand", category: "building", role: "Glass later, simple construction" },

    { id: "iron", label: "Iron", category: "industry", role: "Iron weapons and armor" },
    { id: "copper", label: "Copper", category: "industry", role: "Bronze production later" },
    { id: "tin", label: "Tin", category: "industry", role: "Bronze production later" },
    { id: "coal", label: "Coal", category: "industry", role: "Smelting, industry, fuel" },
    { id: "sulfur", label: "Sulfur", category: "industry", role: "Chemistry and advanced warfare later" },

    { id: "gold", label: "Gold", category: "precious", role: "Wealth, trade, nobles" },
    { id: "silver", label: "Silver", category: "precious", role: "Currency, trade, luxury" },
    { id: "diamonds", label: "Diamonds", category: "precious", role: "High luxury, trade, nobles" },
    { id: "pearls", label: "Pearls", category: "precious", role: "Luxury and trade" },

    { id: "salt", label: "Salt", category: "natural", role: "Food preservation, trade, simple medicine" },
    { id: "fish", label: "Fish", category: "natural", role: "Food" },
    { id: "spices", label: "Spices", category: "natural", role: "Luxury and trade" },

    { id: "wheat", label: "Wheat", category: "crop", role: "Bread" },
    { id: "vegetables", label: "Vegetables", category: "crop", role: "Food variety" },
    { id: "fruit", label: "Fruit", category: "crop", role: "Food, alcohol later" },
    { id: "cotton", label: "Cotton", category: "crop", role: "Civil clothing, bandages later" },
    { id: "herbs", label: "Herbs", category: "crop", role: "Medicine later" },
    { id: "honey", label: "Honey", category: "crop", role: "Food, medicine later" },

    { id: "cattle", label: "Cattle", category: "animal", role: "Meat, milk, leather", outputs: ["meat", "milk", "leather"] },
    { id: "sheep", label: "Sheep", category: "animal", role: "Wool, meat, little milk", outputs: ["wool", "meat", "milk"] },
    { id: "horses", label: "Horses", category: "animal", role: "Army and transport", outputs: [] },
    { id: "deer", label: "Deer", category: "animal", role: "Meat, leather", outputs: ["meat", "leather"] },
    { id: "foxes", label: "Foxes", category: "animal", role: "Fur only", outputs: ["fur"] }
  ];

  const naturalTraits = [
    { id: "river", label: "River", role: "Improves fertility, fish, clay, and affects crossings" },
    { id: "lake", label: "Lake", role: "Improves fertility, fish, clay, and special water resources" },
    { id: "coast", label: "Coast", role: "Opens fish, pearls, salt, and sand" },
    { id: "oasis", label: "Oasis", role: "Allows limited desert farming and settlement value" },
    { id: "high-fertility", label: "High Fertility", role: "Improves agricultural output" },
    { id: "forest-density", label: "Forest Density", role: "Supports wood, honey, herbs, deer, and foxes" },
    { id: "mineral-vein", label: "Mineral Vein", role: "Opens iron, copper, tin, and coal" },
    { id: "precious-vein", label: "Precious Vein", role: "Opens gold and silver" },
    { id: "gem-vein", label: "Gem Vein", role: "Opens diamonds" },
    { id: "volcanic", label: "Volcanic Trait", role: "Opens sulfur; not a primary terrain" },
    { id: "rich-deposit", label: "Rich Deposit", role: "Raises extraction efficiency for a deposit" }
  ];

  function indexById(items) {
    return items.reduce((result, item) => {
      result[item.id] = item;
      return result;
    }, {});
  }

  namespace.resources = Object.freeze({
    resourceCategories,
    resourceTypes,
    resourceById: Object.freeze(indexById(resourceTypes)),
    naturalTraits,
    naturalTraitById: Object.freeze(indexById(naturalTraits))
  });
})(window.EcoRuler = window.EcoRuler || {});
