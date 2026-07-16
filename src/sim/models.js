(function initializeModels(namespace) {
  const MAX_PRODUCTION_SLOTS = 3;
  let nextId = 1;

  function createId(prefix) {
    const id = `${prefix}-${String(nextId).padStart(4, "0")}`;
    nextId += 1;
    return id;
  }

  function terrainExists(terrainId) {
    return namespace.data.terrainTypes.some((terrain) => terrain.id === terrainId);
  }

  function traitExists(traitId) {
    return Boolean(namespace.resources.naturalTraitById[traitId]);
  }

  function resourceExists(resourceId) {
    return Boolean(namespace.resources.resourceById[resourceId]);
  }

  function uniqueValues(values) {
    return Array.from(new Set(values));
  }

  function assertTerrain(terrainId) {
    if (!terrainExists(terrainId)) {
      throw new Error(`Unknown terrain type: ${terrainId}`);
    }
  }

  function assertTraits(traits) {
    traits.forEach((traitId) => {
      if (!traitExists(traitId)) {
        throw new Error(`Unknown natural trait: ${traitId}`);
      }
    });
  }

  function assertResource(resourceId) {
    if (resourceId !== null && resourceId !== undefined && !resourceExists(resourceId)) {
      throw new Error(`Unknown resource type: ${resourceId}`);
    }
  }

  function createProductionSlot(options = {}) {
    const {
      id = createId("slot"),
      index = 1,
      status = index === 1 ? "open" : "locked",
      resourceId = null,
      buildingId = null,
      efficiency = 0,
      workersAssigned = 0
    } = options;

    if (index < 1 || index > MAX_PRODUCTION_SLOTS) {
      throw new Error(`Production slot index must be between 1 and ${MAX_PRODUCTION_SLOTS}.`);
    }
    assertResource(resourceId);

    return {
      id,
      index,
      status,
      resourceId,
      buildingId,
      efficiency,
      workersAssigned
    };
  }

  function createProductionSlots(overrides = []) {
    return Array.from({ length: MAX_PRODUCTION_SLOTS }, (_, position) => {
      const index = position + 1;
      const override = overrides.find((slot) => slot.index === index) || {};
      return createProductionSlot({ index, ...override });
    });
  }

  function createRegion(options = {}) {
    const {
      id = createId("region"),
      name = "Unsurveyed Region",
      terrainId = "plains",
      traits = [],
      neighbors = [],
      ownerId = null,
      controllerId = null,
      discovered = false,
      productionSlots = null,
      notes = ""
    } = options;

    const cleanTraits = uniqueValues(traits);
    assertTerrain(terrainId);
    assertTraits(cleanTraits);

    return {
      id,
      name,
      terrainId,
      traits: cleanTraits,
      neighbors: uniqueValues(neighbors),
      ownerId,
      controllerId,
      discovered,
      productionSlots: productionSlots || createProductionSlots(),
      notes
    };
  }

  function createCity(options = {}) {
    const {
      id = createId("city"),
      name = "New Village",
      level = "village",
      regionId = null,
      controlledRegionIds = [],
      population = 100,
      commoners = 96,
      nobles = 4,
      storage = {}
    } = options;

    return {
      id,
      name,
      level,
      regionId,
      controlledRegionIds: uniqueValues(regionId ? [regionId, ...controlledRegionIds] : controlledRegionIds),
      population,
      commoners,
      nobles,
      storage: { ...storage }
    };
  }

  function createOutpost(options = {}) {
    const {
      id = createId("outpost"),
      name = "New Outpost",
      regionId = null,
      controlledSlotIndex = 1,
      upkeep = { food: 0, money: 0, soldiers: 0 },
      storage = {}
    } = options;

    return {
      id,
      name,
      regionId,
      controlledSlotIndex,
      upkeep: { ...upkeep },
      storage: { ...storage },
      slotLimit: 1
    };
  }

  function createResourceStockpile(initialValues = {}) {
    const stockpile = {};
    Object.entries(initialValues).forEach(([resourceId, amount]) => {
      assertResource(resourceId);
      stockpile[resourceId] = Math.max(0, Number(amount) || 0);
    });
    return stockpile;
  }

  function createModelSummary() {
    return {
      terrainTypes: namespace.data.terrainTypes.length,
      resourceTypes: namespace.resources.resourceTypes.length,
      naturalTraits: namespace.resources.naturalTraits.length,
      regionSlots: MAX_PRODUCTION_SLOTS,
      factories: ["Region", "Production Slot", "City", "Outpost", "Resource Stockpile"]
    };
  }

  namespace.models = Object.freeze({
    MAX_PRODUCTION_SLOTS,
    createProductionSlot,
    createProductionSlots,
    createRegion,
    createCity,
    createOutpost,
    createResourceStockpile,
    createModelSummary
  });
})(window.EcoRuler = window.EcoRuler || {});
