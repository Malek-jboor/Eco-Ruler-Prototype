(function initializeMapGenerator(namespace) {
  const terrainBandMultipliers = {
    north: {
      mountains: 2.2,
      hills: 1.45,
      plains: 0.85,
      forests: 0.9,
      desert: 0.45,
      swamps: 0.55
    },
    center: {
      mountains: 0.55,
      hills: 0.95,
      plains: 1.3,
      forests: 1.45,
      desert: 0.6,
      swamps: 1.25
    },
    south: {
      mountains: 0.45,
      hills: 0.85,
      plains: 1.0,
      forests: 0.42,
      desert: 2.1,
      swamps: 0.35
    }
  };

  const terrainCompatibility = {
    mountains: { mountains: 1, hills: 0.82, forests: 0.34, plains: 0.25, desert: 0.18, swamps: 0.08 },
    hills: { mountains: 0.82, hills: 1, forests: 0.58, plains: 0.62, desert: 0.45, swamps: 0.22 },
    plains: { mountains: 0.25, hills: 0.62, forests: 0.64, plains: 1, desert: 0.58, swamps: 0.44 },
    forests: { mountains: 0.34, hills: 0.58, forests: 1, plains: 0.64, desert: 0.18, swamps: 0.66 },
    desert: { mountains: 0.18, hills: 0.45, forests: 0.18, plains: 0.58, desert: 1, swamps: 0.05 },
    swamps: { mountains: 0.08, hills: 0.22, forests: 0.66, plains: 0.44, desert: 0.05, swamps: 1 }
  };

  const neighborOffsets = [
    { x: 0, y: -1, weight: 1 },
    { x: 1, y: 0, weight: 1 },
    { x: 0, y: 1, weight: 1 },
    { x: -1, y: 0, weight: 1 },
    { x: -1, y: -1, weight: 0.62 },
    { x: 1, y: -1, weight: 0.62 },
    { x: 1, y: 1, weight: 0.62 },
    { x: -1, y: 1, weight: 0.62 }
  ];

  const terrainCodes = {
    mountains: 'MNT',
    hills: 'HIL',
    plains: 'PLN',
    forests: 'FOR',
    desert: 'DES',
    swamps: 'SWP'
  };

  const traitAbbreviations = {
    river: 'Riv',
    lake: 'Lak',
    coast: 'Sea',
    oasis: 'Oas',
    'high-fertility': 'Fer',
    'forest-density': 'Den',
    'mineral-vein': 'Min',
    'precious-vein': 'Prc',
    'gem-vein': 'Gem',
    volcanic: 'Vol',
    'rich-deposit': 'Rich'
  };

  function hashSeed(seed) {
    const text = String(seed || 'eco-ruler');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let value = hashSeed(seed);
    return function random() {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clampPercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numericValue)));
  }

  function normalizeTerrainWeights(weights = {}) {
    const normalized = {};
    namespace.data.terrainTypes.forEach((terrain) => {
      normalized[terrain.id] = clampPercent(weights[terrain.id]);
    });

    const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      return normalized;
    }

    namespace.data.terrainTypes.forEach((terrain) => {
      normalized[terrain.id] = 1;
    });
    return normalized;
  }

  function normalizeClusterStrength(value) {
    return clampPercent(value);
  }

  function bandForRow(row, height) {
    const yRatio = height <= 1 ? 0 : row / (height - 1);
    if (yRatio < 0.34) {
      return 'north';
    }
    if (yRatio < 0.67) {
      return 'center';
    }
    return 'south';
  }

  function regionIdFor(x, y) {
    return `region-${String((y * 100) + x + 1).padStart(4, '0')}`;
  }

  function neighborsFor(x, y, width, height) {
    const neighbors = [];
    if (y > 0) neighbors.push(regionIdFor(x, y - 1));
    if (x < width - 1) neighbors.push(regionIdFor(x + 1, y));
    if (y < height - 1) neighbors.push(regionIdFor(x, y + 1));
    if (x > 0) neighbors.push(regionIdFor(x - 1, y));
    return neighbors;
  }

  function weightedPick(options, random) {
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    if (total <= 0) {
      return options[0].terrainId;
    }

    let roll = random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        return option.terrainId;
      }
    }
    return options[options.length - 1].terrainId;
  }

  function baseWeightFor(terrainId, y, height, terrainWeights) {
    const band = bandForRow(y, height);
    const bandMultiplier = terrainBandMultipliers[band][terrainId] || 1;
    return terrainWeights[terrainId] * bandMultiplier;
  }

  function baseOptionsFor(y, height, terrainWeights, random) {
    return namespace.data.terrainTypes.map((terrain) => ({
      terrainId: terrain.id,
      weight: baseWeightFor(terrain.id, y, height, terrainWeights) * (0.92 + random() * 0.16)
    }));
  }

  function createInitialTerrainGrid(width, height, terrainWeights, random) {
    return Array.from({ length: height }, (_, y) => Array.from({ length: width }, () => {
      return weightedPick(baseOptionsFor(y, height, terrainWeights, random), random);
    }));
  }

  function neighborAffinityFor(terrainId, grid, x, y, width, height) {
    let score = 0;
    let maxScore = 0;

    neighborOffsets.forEach((offset) => {
      const nx = x + offset.x;
      const ny = y + offset.y;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        return;
      }

      const neighborTerrain = grid[ny][nx];
      const compatibility = terrainCompatibility[terrainId][neighborTerrain] ?? 0.12;
      score += compatibility * offset.weight;
      maxScore += offset.weight;
    });

    return maxScore > 0 ? score / maxScore : 0;
  }

  function scoreTerrainChoice(terrainId, grid, x, y, width, height, terrainWeights, clusterRatio) {
    const baseWeight = baseWeightFor(terrainId, y, height, terrainWeights);
    if (baseWeight <= 0) {
      return 0;
    }

    const distributionRatio = 1 - clusterRatio;
    const terrainCount = namespace.data.terrainTypes.length;
    const averageBaseWeight = namespace.data.terrainTypes.reduce((sum, terrain) => {
      return sum + baseWeightFor(terrain.id, y, height, terrainWeights);
    }, 0) / terrainCount;
    const neighborAffinity = neighborAffinityFor(terrainId, grid, x, y, width, height);
    const clusterWeight = neighborAffinity * Math.max(1, averageBaseWeight) * terrainCount;

    return (baseWeight * distributionRatio) + (clusterWeight * clusterRatio);
  }

  function smoothTerrainGrid(grid, width, height, terrainWeights, clusterStrength, random) {
    const clusterRatio = normalizeClusterStrength(clusterStrength) / 100;
    if (clusterRatio <= 0) {
      return grid;
    }

    const passes = clusterRatio >= 0.72 ? 4 : 3;
    let currentGrid = grid;

    for (let pass = 0; pass < passes; pass += 1) {
      currentGrid = currentGrid.map((row) => [...row]);
      const nextGrid = currentGrid.map((row) => [...row]);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const options = namespace.data.terrainTypes.map((terrain) => ({
            terrainId: terrain.id,
            weight: scoreTerrainChoice(terrain.id, currentGrid, x, y, width, height, terrainWeights, clusterRatio)
          }));

          nextGrid[y][x] = weightedPick(options, random);
        }
      }

      currentGrid = nextGrid;
    }

    return softenSingleTileOutliers(currentGrid, width, height, terrainWeights, clusterRatio, random);
  }

  function sameCardinalNeighborCount(grid, x, y, width, height) {
    const terrainId = grid[y][x];
    return neighborOffsets.slice(0, 4).reduce((count, offset) => {
      const nx = x + offset.x;
      const ny = y + offset.y;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        return count;
      }
      return count + (grid[ny][nx] === terrainId ? 1 : 0);
    }, 0);
  }

  function softenSingleTileOutliers(grid, width, height, terrainWeights, clusterRatio, random) {
    if (clusterRatio < 0.45) {
      return grid;
    }

    const nextGrid = grid.map((row) => [...row]);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (sameCardinalNeighborCount(grid, x, y, width, height) > 0) {
          continue;
        }

        const options = namespace.data.terrainTypes.map((terrain) => ({
          terrainId: terrain.id,
          weight: scoreTerrainChoice(terrain.id, grid, x, y, width, height, terrainWeights, Math.min(1, clusterRatio + 0.2))
        }));
        nextGrid[y][x] = weightedPick(options, random);
      }
    }
    return nextGrid;
  }

  function createTraitGrid(width, height) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => new Set()));
  }

  function addTrait(traitGrid, x, y, traitId) {
    traitGrid[y][x].add(traitId);
  }

  function hasTrait(traitGrid, x, y, traitId) {
    return traitGrid[y][x].has(traitId);
  }

  function centralEdgeIndexes(length) {
    const center = Math.floor(length / 2);
    const start = Math.max(0, center - 1);
    const end = Math.min(length - 1, center + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  function addCoastTraits(traitGrid, width, height) {
    centralEdgeIndexes(width).forEach((x) => {
      addTrait(traitGrid, x, 0, 'coast');
      addTrait(traitGrid, x, height - 1, 'coast');
    });

    centralEdgeIndexes(height).forEach((y) => {
      addTrait(traitGrid, 0, y, 'coast');
      addTrait(traitGrid, width - 1, y, 'coast');
    });
  }

  function chooseRiverStart(width, height, random) {
    const center = Math.floor(width / 2);
    return Math.max(1, Math.min(width - 2, center + Math.floor(random() * 5) - 2));
  }

  function addRiverTraits(traitGrid, terrainGrid, width, height, random) {
    const riverCount = width >= 10 ? 2 : 1;

    for (let riverIndex = 0; riverIndex < riverCount; riverIndex += 1) {
      let x = riverIndex === 0 ? chooseRiverStart(width, height, random) : Math.max(1, Math.min(width - 2, Math.floor(width * (0.25 + random() * 0.5))));
      const maxLength = riverIndex === 0 ? height : Math.max(5, Math.floor(height * 0.72));

      for (let y = 0; y < maxLength; y += 1) {
        addTrait(traitGrid, x, y, 'river');

        const candidates = [-1, 0, 1].map((dx) => {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const ny = Math.min(height - 1, y + 1);
          const terrain = terrainGrid[ny][nx];
          const terrainPreference = {
            mountains: 0.55,
            hills: 0.9,
            plains: 1.35,
            forests: 1.25,
            desert: 0.55,
            swamps: 1.2
          }[terrain] || 1;
          const centerPull = 1 - Math.abs(nx - width / 2) / width;
          return { dx, weight: terrainPreference + centerPull + random() * 0.35 };
        });
        x = Math.max(0, Math.min(width - 1, x + weightedPick(candidates.map((candidate) => ({ terrainId: candidate.dx, weight: candidate.weight })), random)));
      }
    }
  }

  function terrainAt(terrainGrid, x, y) {
    return terrainGrid[y][x];
  }

  function addRandomTraitByTerrain(traitGrid, terrainGrid, width, height, random, traitId, terrainChance) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const terrain = terrainAt(terrainGrid, x, y);
        const chance = terrainChance[terrain] || 0;
        if (random() < chance) {
          addTrait(traitGrid, x, y, traitId);
        }
      }
    }
  }

  function addLakeTraits(traitGrid, terrainGrid, width, height, random) {
    const candidates = [];
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const terrain = terrainAt(terrainGrid, x, y);
        const nearRiver = hasTrait(traitGrid, x, y, 'river') ? 1 : 0;
        const weight = ({ plains: 2.1, forests: 1.8, swamps: 1.9, hills: 1, mountains: 0.25, desert: 0.15 }[terrain] || 0.6) + nearRiver * 1.4;
        candidates.push({ terrainId: `${x},${y}`, weight });
      }
    }

    const lakeCount = Math.max(1, Math.round((width * height) / 70));
    for (let index = 0; index < lakeCount; index += 1) {
      const pick = weightedPick(candidates, random).split(',').map(Number);
      addTrait(traitGrid, pick[0], pick[1], 'lake');
    }
  }

  function addFertilityTraits(traitGrid, terrainGrid, width, height, random) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const terrain = terrainAt(terrainGrid, x, y);
        const waterBoost = hasTrait(traitGrid, x, y, 'river') || hasTrait(traitGrid, x, y, 'lake') || hasTrait(traitGrid, x, y, 'oasis') ? 0.35 : 0;
        const baseChance = { plains: 0.22, forests: 0.2, swamps: 0.12, hills: 0.05, desert: 0.01, mountains: 0 }[terrain] || 0;
        if (random() < baseChance + waterBoost) {
          addTrait(traitGrid, x, y, 'high-fertility');
        }
      }
    }
  }

  function addOasisTraits(traitGrid, terrainGrid, width, height, random) {
    const desertCandidates = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (terrainAt(terrainGrid, x, y) === 'desert' && !hasTrait(traitGrid, x, y, 'coast')) {
          desertCandidates.push({ terrainId: `${x},${y}`, weight: 1 + random() });
        }
      }
    }

    desertCandidates.forEach((candidate) => {
      if (random() < 0.15) {
        const pick = candidate.terrainId.split(',').map(Number);
        addTrait(traitGrid, pick[0], pick[1], 'oasis');
      }
    });
  }

  function addDepositTraits(traitGrid, terrainGrid, width, height, random) {
    addRandomTraitByTerrain(traitGrid, terrainGrid, width, height, random, 'mineral-vein', {
      mountains: 0.34,
      hills: 0.22,
      desert: 0.08,
      plains: 0,
      forests: 0,
      swamps: 0
    });

    addRandomTraitByTerrain(traitGrid, terrainGrid, width, height, random, 'precious-vein', {
      mountains: 0.11,
      hills: 0.07,
      desert: 0.035,
      plains: 0
    });

    addRandomTraitByTerrain(traitGrid, terrainGrid, width, height, random, 'gem-vein', {
      mountains: 0.045,
      hills: 0.025,
      desert: 0.04
    });

    addRandomTraitByTerrain(traitGrid, terrainGrid, width, height, random, 'volcanic', {
      mountains: 0.055,
      hills: 0,
      desert: 0
    });

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const hasDeposit = ['mineral-vein', 'precious-vein', 'gem-vein', 'volcanic'].some((traitId) => hasTrait(traitGrid, x, y, traitId));
        if (hasDeposit && random() < 0.32) {
          addTrait(traitGrid, x, y, 'rich-deposit');
        }
      }
    }
  }

  function addNaturalTraits(terrainGrid, width, height, seed) {
    const random = createRandom(`${seed}:natural-layer`);
    const traitGrid = createTraitGrid(width, height);

    addCoastTraits(traitGrid, width, height);
    addRiverTraits(traitGrid, terrainGrid, width, height, random);
    addLakeTraits(traitGrid, terrainGrid, width, height, random);
    addOasisTraits(traitGrid, terrainGrid, width, height, random);
    addRandomTraitByTerrain(traitGrid, terrainGrid, width, height, random, 'forest-density', {
      mountains: 0.02,
      forests: 0.3,
      swamps: 0.18,
      hills: 0.1,
      plains: 0.05
    });
    addFertilityTraits(traitGrid, terrainGrid, width, height, random);
    addDepositTraits(traitGrid, terrainGrid, width, height, random);

    return traitGrid.map((row) => row.map((traitSet) => Array.from(traitSet)));
  }

  function summarizeMap(regions) {
    const terrainCounts = {};
    const traitCounts = {};
    namespace.data.terrainTypes.forEach((terrain) => {
      terrainCounts[terrain.id] = 0;
    });
    namespace.resources.naturalTraits.forEach((trait) => {
      traitCounts[trait.id] = 0;
    });

    regions.forEach((region) => {
      terrainCounts[region.terrainId] += 1;
      region.traits.forEach((traitId) => {
        traitCounts[traitId] += 1;
      });
    });

    return {
      totalRegions: regions.length,
      terrainCounts,
      traitCounts,
      traitBearingRegions: regions.filter((region) => region.traits.length > 0).length
    };
  }

  function buildRegionsFromTerrainGrid(terrainGrid, traitGrid, width, height) {
    const regions = [];

    for (let y = 0; y < height; y += 1) {
      const band = bandForRow(y, height);
      for (let x = 0; x < width; x += 1) {
        const terrainId = terrainGrid[y][x];
        const traits = traitGrid[y][x];
        const region = namespace.models.createRegion({
          id: regionIdFor(x, y),
          name: `Region ${x + 1}-${y + 1}`,
          terrainId,
          traits,
          neighbors: neighborsFor(x, y, width, height),
          discovered: true,
          notes: `${band} climate band`
        });

        region.grid = { x, y };
        region.terrainCode = terrainCodes[terrainId] || terrainId.slice(0, 3).toUpperCase();
        region.traitCodes = traits.map((traitId) => traitAbbreviations[traitId] || traitId.slice(0, 3));
        regions.push(region);
      }
    }

    return regions;
  }

  function generateRegionMap(options = {}) {
    const defaults = namespace.data.mapDefaults;
    const width = Math.max(4, Number(options.width || defaults.width));
    const height = Math.max(4, Number(options.height || defaults.height));
    const seed = String(options.seed || defaults.seed);
    const terrainWeights = normalizeTerrainWeights(options.terrainWeights || defaults.terrainWeights);
    const clusterStrength = normalizeClusterStrength(options.clusterStrength ?? defaults.clusterStrength);
    const random = createRandom(`${seed}:${clusterStrength}`);
    const initialGrid = createInitialTerrainGrid(width, height, terrainWeights, random);
    const terrainGrid = smoothTerrainGrid(initialGrid, width, height, terrainWeights, clusterStrength, random);
    const traitGrid = addNaturalTraits(terrainGrid, width, height, seed);
    const regions = buildRegionsFromTerrainGrid(terrainGrid, traitGrid, width, height);

    return {
      seed,
      width,
      height,
      clusterStrength,
      terrainWeights,
      regions,
      selectedRegionId: null,
      summary: summarizeMap(regions)
    };
  }

  namespace.mapGenerator = Object.freeze({
    generateRegionMap,
    normalizeTerrainWeights,
    normalizeClusterStrength
  });
})(window.EcoRuler = window.EcoRuler || {});
