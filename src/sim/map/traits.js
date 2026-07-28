(function initializeMapTraits(namespace) {
  const {
    mapViewBox,
    waterTerrainId,
    shapeSizeScale,
    riverShapeLengthScale,
    createRandom,
    isWaterTerrain,
    isLandTerrain,
    profileFor,
    weightedPick
  } = namespace.mapCore;
  function createTraitSets(layouts) {
    return layouts.map(() => new Set());
  }

  function addTrait(traitSets, index, traitId) {
    traitSets[index].add(traitId);
  }

  function hasTrait(traitSets, index, traitId) {
    return traitSets[index].has(traitId);
  }

  function countTrait(traitSets, traitId) {
    return traitSets.reduce((count, traitSet) => count + (traitSet.has(traitId) ? 1 : 0), 0);
  }

  function minimumTraitCountForMapSize(mapSize) {
    return { small: 1, medium: 2, large: 3 }[mapSize] || 1;
  }

  function layoutTouchesWater(layout, layoutsById, terrainAssignments) {
    return layout.neighbors.some((neighborId) => {
      const neighbor = layoutsById[neighborId];
      return neighbor && isWaterTerrain(terrainAssignments[neighbor.index]);
    });
  }

  function isTraitAllowedForLayout(traitId, layout, layoutsById, terrainAssignments, traitSets) {
    if (!layout || hasTrait(traitSets, layout.index, traitId)) return false;
    const terrain = terrainAssignments[layout.index];
    if (!isLandTerrain(terrain)) return false;

    switch (traitId) {
      case 'river':
        return isTerrainAllowedForRiver(terrain);
      case 'lake':
        return isTerrainAllowedForLake(terrain) && !hasTrait(traitSets, layout.index, 'coast');
      case 'coast':
        return layoutTouchesWater(layout, layoutsById, terrainAssignments);
      case 'oasis':
        return terrain === 'desert';
      case 'high-fertility':
        return (terrain === 'plains' || terrain === 'forests' || terrain === 'hills' || terrain === 'swamps')
          && (hasTrait(traitSets, layout.index, 'river') || hasTrait(traitSets, layout.index, 'lake'));
      case 'forest-density':
        return terrain === 'forests';
      case 'scattered-trees':
        return terrain === 'mountains' || terrain === 'hills' || terrain === 'plains' || terrain === 'desert' || terrain === 'swamps';
      case 'mineral-vein':
      case 'precious-vein':
        return terrain === 'mountains' || terrain === 'hills';
      case 'gem-vein':
        return terrain === 'mountains';
      case 'volcanic':
        return terrain === 'mountains';
      case 'oyster-bed':
        return hasTrait(traitSets, layout.index, 'coast') && (terrain === 'plains' || terrain === 'forests' || terrain === 'desert' || terrain === 'swamps');
      case 'god-bless':
        return true;
      default:
        return true;
    }
  }

  function traitPlacementWeight(traitId, layout, layoutsById, terrainAssignments, traitSets, random) {
    const terrain = terrainAssignments[layout.index];
    const nearRiver = layout.neighbors.some((neighborId) => {
      const neighbor = layoutsById[neighborId];
      return neighbor && hasTrait(traitSets, neighbor.index, 'river');
    });

    const baseWeights = {
      river: terrainPreferenceForRiver(terrain),
      lake: ({ plains: 2.1, forests: 1.8, swamps: 1.9, hills: 1, mountains: 0.25 }[terrain] || 0.6) + (nearRiver ? 1.4 : 0),
      coast: layoutTouchesWater(layout, layoutsById, terrainAssignments) ? 2 : 0,
      oasis: terrain === 'desert' ? 2 + (hasTrait(traitSets, layout.index, 'coast') ? 0 : 0.8) : 0,
      'high-fertility': ({ plains: 2.2, forests: 1.7, swamps: 1.5, hills: 0.9 }[terrain] || 0.5),
      'forest-density': terrain === 'forests' ? 3 : 0,
      'scattered-trees': ({ mountains: 1, hills: 1, plains: 1.2, desert: 0.55, swamps: 1.4 }[terrain] || 0),
      'mineral-vein': ({ mountains: 6, hills: 0.55 }[terrain] || 0),
      'precious-vein': ({ mountains: 6.4, hills: 0.38 }[terrain] || 0),
      'gem-vein': ({ mountains: 5.8 }[terrain] || 0),
      volcanic: ({ mountains: 2.4 }[terrain] || 0),
      'oyster-bed': hasTrait(traitSets, layout.index, 'coast') ? ({ desert: 2.2, plains: 1.8, swamps: 1.4, forests: 0.9 }[terrain] || 0) : 0,
      'god-bless': godBlessWeight(layout, traitSets, terrainAssignments, random)
    };

    const neighborBonus = layout.neighbors.reduce((bonus, neighborId) => {
      const neighbor = layoutsById[neighborId];
      return bonus + (neighbor && hasTrait(traitSets, neighbor.index, traitId) ? 0.2 : 0);
    }, 0);

    return (baseWeights[traitId] || 1) + neighborBonus + random() * 0.35;
  }

  function ensureMinimumTraitCount(layouts, traitSets, terrainAssignments, mapSize, random, traitId) {
    const minimumCount = minimumTraitCountForMapSize(mapSize);
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));

    while (countTrait(traitSets, traitId) < minimumCount) {
      const candidates = layouts
        .filter((layout) => isTraitAllowedForLayout(traitId, layout, layoutsById, terrainAssignments, traitSets))
        .map((layout) => ({
          value: layout.index,
          weight: traitPlacementWeight(traitId, layout, layoutsById, terrainAssignments, traitSets, random)
        }))
        .filter((candidate) => candidate.weight > 0);

      if (!candidates.length) break;
      addTrait(traitSets, weightedPick(candidates, random), traitId);
    }
  }

  function ensureMinimumNaturalTraitCounts(layouts, traitSets, terrainAssignments, mapSize, random) {
    const pathManagedTraits = new Set(['river', 'high-fertility']);
    namespace.resources.naturalTraits
      .map((trait) => trait.id)
      .filter((traitId) => !pathManagedTraits.has(traitId))
      .forEach((traitId) => ensureMinimumTraitCount(layouts, traitSets, terrainAssignments, mapSize, random, traitId));
  }
  function addCoastTraits(layouts, traitSets, terrainAssignments) {
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    layouts.forEach((layout) => {
      if (!isLandTerrain(terrainAssignments[layout.index])) return;
      const touchesWater = layout.neighbors.some((neighborId) => {
        const neighbor = layoutsById[neighborId];
        return neighbor && isWaterTerrain(terrainAssignments[neighbor.index]);
      });
      if (touchesWater) {
        addTrait(traitSets, layout.index, 'coast');
      }
    });
  }

  function isTerrainAllowedForRiver(terrainId) {
    return isLandTerrain(terrainId);
  }

  function isTerrainAllowedForLake(terrainId) {
    return isLandTerrain(terrainId) && terrainId !== 'desert';
  }

  function terrainPreferenceForRiver(terrainId) {
    return { mountains: 0.45, hills: 1.05, plains: 1.7, forests: 1.45, desert: 0.42, swamps: 1.35 }[terrainId] || 0;
  }

  function terrainRoughnessForRiver(terrainId) {
    return { mountains: 3, hills: 2, plains: 1, forests: 1, desert: 2, swamps: 1 }[terrainId] || 1;
  }

  function terrainHeightForRiver(terrainId) {
    return { mountains: 4, hills: 3, desert: 2, plains: 1, forests: 1, swamps: 0 }[terrainId] ?? 1;
  }

  function riverSourceBaseWeight(terrainId) {
    return { mountains: 2.4, hills: 1.8, forests: 1.15, swamps: 1.05, plains: 0.95 }[terrainId] || 0;
  }

  function sourceWeightForRiver(layout, layoutsById, terrainAssignments) {
    const terrain = terrainAssignments[layout.index];
    const baseWeight = riverSourceBaseWeight(terrain);
    if (baseWeight <= 0) return 0;

    const currentHeight = terrainHeightForRiver(terrain);
    let flowNeighbors = 0;
    let downhillNeighbors = 0;
    let oceanNeighbors = 0;

    layout.neighbors.forEach((neighborId) => {
      const neighbor = layoutsById[neighborId];
      if (!neighbor) return;
      const neighborTerrain = terrainAssignments[neighbor.index];
      if (isWaterTerrain(neighborTerrain)) {
        oceanNeighbors += 1;
        return;
      }
      if (!isTerrainAllowedForRiver(neighborTerrain)) return;
      const neighborHeight = terrainHeightForRiver(neighborTerrain);
      if (neighborHeight <= currentHeight) {
        flowNeighbors += 1;
      }
      if (neighborHeight < currentHeight) {
        downhillNeighbors += 1;
      }
    });

    if (flowNeighbors === 0) return 0;
    return baseWeight + flowNeighbors * 0.32 + downhillNeighbors * 0.44 - oceanNeighbors * 0.18;
  }

  function riverSourceSpacingFor(mapSize, worldShape) {
    const sizeDistance = { small: 260, medium: 320, large: 380 }[mapSize] || 260;
    const shapeScale = { pangea: 1, continental: 0.92, islands: 0.78 }[worldShape] || 1;
    return sizeDistance * shapeScale;
  }

  function wrappedAxisDistance(first, second, span) {
    const direct = Math.abs(first - second);
    return Math.min(direct, Math.max(0, span - direct));
  }

  function wrappedDistanceBetween(a, b) {
    const dx = wrappedAxisDistance(a.center.x, b.center.x, mapViewBox.width);
    const dy = wrappedAxisDistance(a.center.y, b.center.y, mapViewBox.height);
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function wrappedDistanceFromPoint(layout, point) {
    const dx = wrappedAxisDistance(layout.center.x, point.x, mapViewBox.width);
    const dy = wrappedAxisDistance(layout.center.y, point.y, mapViewBox.height);
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function riverSourceAnchorsFor(count, random) {
    const total = Math.max(1, count);
    const offsetX = random();
    const offsetY = random();
    return Array.from({ length: total }, (_, index) => {
      const xRatio = (index + offsetX) / total;
      const yRatio = 0.18 + (((index * 0.61803398875) + offsetY) % 1) * 0.64;
      return {
        x: (xRatio % 1) * mapViewBox.width,
        y: yRatio * mapViewBox.height
      };
    });
  }

  function pickRiverSourceForAnchor(availableSources, layouts, sourceLayouts, anchor, minimumSourceDistance, random) {
    const scoredSources = availableSources.map((candidate) => {
      const layout = layouts[candidate.value];
      const anchorDistance = wrappedDistanceFromPoint(layout, anchor);
      const nearestSourceDistance = sourceLayouts.length
        ? Math.min(...sourceLayouts.map((sourceLayout) => wrappedDistanceBetween(layout, sourceLayout)))
        : minimumSourceDistance;
      const spreadScore = Math.min(2.4, nearestSourceDistance / Math.max(1, minimumSourceDistance)) * 95;
      const sourceQuality = candidate.weight * 70;
      const anchorPenalty = anchorDistance * 0.9;
      return {
        value: candidate.value,
        distance: nearestSourceDistance,
        weight: sourceQuality + spreadScore - anchorPenalty + random() * 18
      };
    });

    const spacedSources = scoredSources.filter((candidate) => candidate.distance >= minimumSourceDistance * 0.72);
    const pool = spacedSources.length ? spacedSources : scoredSources;
    return pool.reduce((best, candidate) => (candidate.weight > best.weight ? candidate : best), pool[0]).value;
  }

  function riverProximityPenalty(layout, layoutsById, traitSets) {
    const directPenalty = hasTrait(traitSets, layout.index, 'river') ? -3 : 0;
    const neighborPenalty = layout.neighbors.reduce((penalty, neighborId) => {
      const neighbor = layoutsById[neighborId];
      return penalty + (neighbor && hasTrait(traitSets, neighbor.index, 'river') ? -0.75 : 0);
    }, 0);
    return directPenalty + neighborPenalty;
  }

  function distanceBetween(a, b) {
    const dx = a.center.x - b.center.x;
    const dy = a.center.y - b.center.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function riverCountFor(profile, landCount) {
    if (landCount <= 0) return 0;
    return Math.max(profile.minimumRivers, Math.round(landCount / profile.riverEveryLandRegions));
  }

  function riverLengthFor(profile, mapSize, worldShape, random, landCount) {
    const sizeScale = shapeSizeScale[mapSize] || 1;
    const shapeScale = riverShapeLengthScale[worldShape] || 1;
    const baseLength = profile.riverLength.min + random() * (profile.riverLength.max - profile.riverLength.min);
    return Math.max(3, Math.min(Math.round(baseLength * sizeScale * shapeScale), Math.max(3, Math.floor(landCount * 0.22))));
  }

  function buildRiverPath(source, layouts, layoutsById, terrainAssignments, traitSets, targetLength, random) {
    const path = [];
    const visited = new Set();
    let current = source;

    while (current && path.length < targetLength) {
      if (visited.has(current.index)) break;
      visited.add(current.index);
      path.push(current.index);

      if (path.length >= 3 && hasTrait(traitSets, current.index, 'coast')) break;
      if (path.length >= 4 && terrainAssignments[current.index] === 'swamps' && random() < 0.35) break;

      const currentTerrain = terrainAssignments[current.index];
      const currentHeight = terrainHeightForRiver(currentTerrain);
      const currentRoughness = terrainRoughnessForRiver(currentTerrain);
      const candidates = current.neighbors
        .map((neighborId) => layoutsById[neighborId])
        .filter((neighbor) => {
          if (!neighbor || visited.has(neighbor.index)) return false;
          const neighborTerrain = terrainAssignments[neighbor.index];
          if (!isTerrainAllowedForRiver(neighborTerrain)) return false;
          return terrainHeightForRiver(neighborTerrain) <= currentHeight;
        })
        .map((neighbor) => {
          const neighborTerrain = terrainAssignments[neighbor.index];
          const nextHeight = terrainHeightForRiver(neighborTerrain);
          const nextRoughness = terrainRoughnessForRiver(neighborTerrain);
          const downhill = Math.max(0, currentHeight - nextHeight) * 0.68;
          const flatFlow = currentHeight === nextHeight ? 0.42 : 0;
          const roughnessDrag = Math.max(0, nextRoughness - currentRoughness) * -0.15;
          const coastEnd = path.length >= 3 && hasTrait(traitSets, neighbor.index, 'coast') ? 2.2 : 0;
          const awayFromSource = Math.min(1.4, distanceBetween(source, neighbor) / 240);
          const existingRiverPenalty = riverProximityPenalty(neighbor, layoutsById, traitSets);
          return {
            value: neighbor.index,
            weight: terrainPreferenceForRiver(neighborTerrain) + downhill + flatFlow + roughnessDrag + coastEnd + awayFromSource + existingRiverPenalty + random() * 0.4
          };
        })
        .filter((candidate) => candidate.weight > 0);

      if (!candidates.length) break;
      current = layouts[weightedPick(candidates, random)];
    }

    return path.length >= 3 ? path : [];
  }

  function addRiverTraits(layouts, traitSets, terrainAssignments, profileId, mapSize, worldShape, seed) {
    const random = createRandom(`${seed}:${profileId}:${mapSize}:${worldShape}:rivers`);
    const profile = profileFor(profileId);
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const landCount = terrainAssignments.filter(isLandTerrain).length;
    const minimumRiverRegions = minimumTraitCountForMapSize(mapSize);
    const desiredCount = Math.max(riverCountFor(profile, landCount), minimumRiverRegions);
    const sourceCandidates = layouts
      .map((layout) => ({ value: layout.index, weight: sourceWeightForRiver(layout, layoutsById, terrainAssignments) }))
      .filter((candidate) => candidate.weight > 0);

    if (!sourceCandidates.length) return [];

    const riverPaths = [];
    const usedSources = new Set();
    const sourceLayouts = [];
    const minimumSourceDistance = riverSourceSpacingFor(mapSize, worldShape);
    const sourceAnchors = riverSourceAnchorsFor(desiredCount, random);
    let created = 0;
    let attempts = 0;
    const maxAttempts = Math.max(24, desiredCount * 12);

    while ((created < desiredCount || countTrait(traitSets, 'river') < minimumRiverRegions) && attempts < maxAttempts) {
      const anchor = sourceAnchors[attempts % sourceAnchors.length];
      attempts += 1;
      const availableSources = sourceCandidates.filter((candidate) => !usedSources.has(candidate.value));
      if (!availableSources.length) break;
      const sourceIndex = pickRiverSourceForAnchor(availableSources, layouts, sourceLayouts, anchor, minimumSourceDistance, random);
      usedSources.add(sourceIndex);
      const targetLength = riverLengthFor(profile, mapSize, worldShape, random, landCount);
      const path = buildRiverPath(layouts[sourceIndex], layouts, layoutsById, terrainAssignments, traitSets, targetLength, random);
      if (!path.length) continue;
      sourceLayouts.push(layouts[sourceIndex]);
      path.forEach((index) => addTrait(traitSets, index, 'river'));
      riverPaths.push(path);
      created += 1;
    }
    return riverPaths;
  }

  function addLakeTraits(layouts, traitSets, terrainAssignments, profileId, random) {
    const profile = profileFor(profileId);
    const landCount = terrainAssignments.filter(isLandTerrain).length;
    const lakeCount = Math.round(landCount * profile.lakeRatio);
    if (lakeCount <= 0) return;

    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const candidates = layouts
      .filter((layout) => isTerrainAllowedForLake(terrainAssignments[layout.index]) && !hasTrait(traitSets, layout.index, 'coast'))
      .map((layout) => {
        const nearRiver = layout.neighbors.some((neighborId) => {
          const neighbor = layoutsById[neighborId];
          return neighbor && hasTrait(traitSets, neighbor.index, 'river');
        });
        const terrainWeight = { plains: 2.1, forests: 1.8, swamps: 1.9, hills: 1, mountains: 0.25 }[terrainAssignments[layout.index]] || 0.6;
        return { value: layout.index, weight: terrainWeight + (nearRiver ? 1.4 : 0) + random() * 0.35 };
      });

    const used = new Set();
    for (let index = 0; index < lakeCount && candidates.length; index += 1) {
      const available = candidates.filter((candidate) => !used.has(candidate.value));
      if (!available.length) break;
      const pick = weightedPick(available, random);
      used.add(pick);
      addTrait(traitSets, pick, 'lake');
    }
  }

  function addFertilityTraits(layouts, traitSets, terrainAssignments, random) {
    const excludedTerrain = new Set(['mountains', 'desert', waterTerrainId]);
    layouts.forEach((layout) => {
      const terrain = terrainAssignments[layout.index];
      const hasRiver = hasTrait(traitSets, layout.index, 'river');
      const hasLake = hasTrait(traitSets, layout.index, 'lake');
      const fertilityChance = hasRiver ? 0.4 : (hasLake ? 0.2 : 0);
      if (fertilityChance && !excludedTerrain.has(terrain) && random() < fertilityChance) {
        addTrait(traitSets, layout.index, 'high-fertility');
      }
    });
  }

  function ensureMinimumHighFertility(layouts, traitSets, terrainAssignments, mapSize, random, riverPaths) {
    const minimumCount = minimumTraitCountForMapSize(mapSize);
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const eligibleTerrain = new Set(['plains', 'forests', 'hills', 'swamps']);

    while (countTrait(traitSets, 'high-fertility') < minimumCount) {
      const waterCandidates = layouts
        .filter((layout) => isTraitAllowedForLayout('high-fertility', layout, layoutsById, terrainAssignments, traitSets))
        .map((layout) => ({
          value: layout.index,
          weight: traitPlacementWeight('high-fertility', layout, layoutsById, terrainAssignments, traitSets, random)
        }));

      if (waterCandidates.length) {
        addTrait(traitSets, weightedPick(waterCandidates, random), 'high-fertility');
        continue;
      }

      const lakeCandidates = layouts
        .filter((layout) => eligibleTerrain.has(terrainAssignments[layout.index]))
        .filter((layout) => !hasTrait(traitSets, layout.index, 'coast'))
        .filter((layout) => !hasTrait(traitSets, layout.index, 'river') && !hasTrait(traitSets, layout.index, 'lake'))
        .map((layout) => ({
          value: layout.index,
          weight: traitPlacementWeight('high-fertility', layout, layoutsById, terrainAssignments, traitSets, random)
        }));

      if (lakeCandidates.length) {
        const selected = weightedPick(lakeCandidates, random);
        addTrait(traitSets, selected, 'lake');
        addTrait(traitSets, selected, 'high-fertility');
        continue;
      }

      const riverCandidates = layouts
        .filter((layout) => eligibleTerrain.has(terrainAssignments[layout.index]))
        .filter((layout) => !hasTrait(traitSets, layout.index, 'high-fertility'))
        .map((layout) => ({
          layout,
          path: buildRiverPath(layout, layouts, layoutsById, terrainAssignments, traitSets, 4, random)
        }))
        .filter((candidate) => candidate.path.length >= 3);

      if (!riverCandidates.length) return;
      const selected = riverCandidates[Math.floor(random() * riverCandidates.length)];
      selected.path.forEach((index) => addTrait(traitSets, index, 'river'));
      addTrait(traitSets, selected.layout.index, 'high-fertility');
      riverPaths.push(selected.path);
    }
  }
  function addOasisTraits(layouts, traitSets, terrainAssignments, profileId, random) {
    const profile = profileFor(profileId);
    layouts.forEach((layout) => {
      const terrain = terrainAssignments[layout.index];
      if (terrain === 'desert' && random() < profile.oasisChance) {
        addTrait(traitSets, layout.index, 'oasis');
      }
    });
  }

  function addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, traitId, terrainChance) {
    layouts.forEach((layout) => {
      const terrain = terrainAssignments[layout.index];
      const chance = terrainChance[terrain] || 0;
      if (chance > 0 && random() < chance) {
        addTrait(traitSets, layout.index, traitId);
      }
    });
  }

  function addDepositTraits(layouts, traitSets, terrainAssignments, random) {
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'mineral-vein', { mountains: 0.5, hills: 0.04, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'precious-vein', { mountains: 0.28, hills: 0.02, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'gem-vein', { mountains: 0.28, hills: 0, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'volcanic', { mountains: 0.28, hills: 0, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
  }

  function addOysterBedTraits(layouts, traitSets, terrainAssignments, random, worldShape) {
    const oysterChance = worldShape === 'islands' ? 0.12 : 0.16;
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    layouts.forEach((layout) => {
      if (!isTraitAllowedForLayout('oyster-bed', layout, layoutsById, terrainAssignments, traitSets)) return;
      if (random() < oysterChance) {
        addTrait(traitSets, layout.index, 'oyster-bed');
      }
    });
  }

  function godBlessLimitForMapSize(mapSize) {
    return minimumTraitCountForMapSize(mapSize);
  }

  function godBlessWeight(layout, traitSets, terrainAssignments, random) {
    const terrain = terrainAssignments[layout.index];
    const terrainWeight = { plains: 1.4, forests: 1.3, hills: 1.2, mountains: 1.1, swamps: 1.1, desert: 0.9 }[terrain] || 1;
    const traitWeight = traitSets[layout.index].size * 0.16;
    return terrainWeight + traitWeight + random() * 0.35;
  }

  function addGodBlessTraits(layouts, traitSets, terrainAssignments, random, mapSize) {
    const limit = godBlessLimitForMapSize(mapSize);
    const used = new Set();

    for (let count = 0; count < limit; count += 1) {
      const candidates = layouts
        .filter((layout) => isLandTerrain(terrainAssignments[layout.index]) && !used.has(layout.index))
        .map((layout) => ({ value: layout.index, weight: godBlessWeight(layout, traitSets, terrainAssignments, random) }));

      if (!candidates.length) return;
      const pick = weightedPick(candidates, random);
      used.add(pick);
      addTrait(traitSets, pick, 'god-bless');
    }
  }

  function addNaturalTraits(layouts, terrainAssignments, seed, profileId, mapSize, worldShape) {
    const random = createRandom(`${seed}:${profileId}:${mapSize}:${worldShape}:natural-layer`);
    const fertilityRandom = createRandom(`${seed}:${profileId}:${mapSize}:${worldShape}:fertility`);
    const traitSets = createTraitSets(layouts);

    addCoastTraits(layouts, traitSets, terrainAssignments);
    const riverPaths = addRiverTraits(layouts, traitSets, terrainAssignments, profileId, mapSize, worldShape, seed);
    addLakeTraits(layouts, traitSets, terrainAssignments, profileId, random);
    addOasisTraits(layouts, traitSets, terrainAssignments, profileId, random);
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'forest-density', { forests: 0.4 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'scattered-trees', { mountains: 0.3, hills: 0.3, plains: 0.4, desert: 0.15, swamps: 0.5 });
    addFertilityTraits(layouts, traitSets, terrainAssignments, fertilityRandom);
    addDepositTraits(layouts, traitSets, terrainAssignments, random);
    addOysterBedTraits(layouts, traitSets, terrainAssignments, random, worldShape);
    addGodBlessTraits(layouts, traitSets, terrainAssignments, random, mapSize);
    ensureMinimumNaturalTraitCounts(layouts, traitSets, terrainAssignments, mapSize, random);
    ensureMinimumHighFertility(layouts, traitSets, terrainAssignments, mapSize, random, riverPaths);

    return {
      traitSets: traitSets.map((traitSet) => Array.from(traitSet)),
      riverPaths
    };
  }

  namespace.mapTraits = Object.freeze({
    createTraitSets,
    addTrait,
    hasTrait,
    countTrait,
    minimumTraitCountForMapSize,
    layoutTouchesWater,
    isTraitAllowedForLayout,
    traitPlacementWeight,
    ensureMinimumTraitCount,
    ensureMinimumNaturalTraitCounts,
    addCoastTraits,
    isTerrainAllowedForRiver,
    isTerrainAllowedForLake,
    terrainPreferenceForRiver,
    terrainRoughnessForRiver,
    terrainHeightForRiver,
    riverSourceBaseWeight,
    sourceWeightForRiver,
    riverSourceSpacingFor,
    wrappedAxisDistance,
    wrappedDistanceBetween,
    wrappedDistanceFromPoint,
    riverSourceAnchorsFor,
    pickRiverSourceForAnchor,
    riverProximityPenalty,
    distanceBetween,
    riverCountFor,
    riverLengthFor,
    buildRiverPath,
    addRiverTraits,
    addLakeTraits,
    addFertilityTraits,
    addOasisTraits,
    addRandomTraitByTerrain,
    addDepositTraits,
    addOysterBedTraits,
    godBlessLimitForMapSize,
    godBlessWeight,
    addGodBlessTraits,
    addNaturalTraits
  });
})(window.EcoRuler = window.EcoRuler || {});
