(function initializeMapGeometry(namespace) {
  const { mapViewBox, createRandom, regionIdFor } = namespace.mapCore;
  function rectangleBoundary() {
    return [
      { x: 0, y: 0 },
      { x: mapViewBox.width, y: 0 },
      { x: mapViewBox.width, y: mapViewBox.height },
      { x: 0, y: mapViewBox.height }
    ];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createSitePoints(width, height, seed, random) {
    const points = [];
    const cellWidth = mapViewBox.width / width;
    const cellHeight = mapViewBox.height / height;
    const jitterX = cellWidth * 0.72;
    const jitterY = cellHeight * 0.68;
    const marginX = cellWidth * 0.22;
    const marginY = cellHeight * 0.22;
    const rowOffsets = Array.from({ length: height }, () => (random() - 0.5) * cellWidth * 0.42);
    const columnOffsets = Array.from({ length: width }, () => (random() - 0.5) * cellHeight * 0.32);

    for (let row = 0; row < height; row += 1) {
      const rowWave = Math.sin((row / Math.max(1, height - 1)) * Math.PI * 2.3) * cellWidth * 0.12;
      const rowStagger = row % 2 === 0 ? -cellWidth * 0.16 : cellWidth * 0.18;

      for (let column = 0; column < width; column += 1) {
        const isEdge = row === 0 || column === 0 || row === height - 1 || column === width - 1;
        const columnWave = Math.cos((column / Math.max(1, width - 1)) * Math.PI * 2.1) * cellHeight * 0.1;
        const edgeDamping = isEdge ? 0.42 : 1;
        const baseX = (column + 0.5) * cellWidth;
        const baseY = (row + 0.5) * cellHeight;
        const x = baseX + ((random() - 0.5) * jitterX + rowOffsets[row] + rowWave + rowStagger) * edgeDamping;
        const y = baseY + ((random() - 0.5) * jitterY + columnOffsets[column] + columnWave) * edgeDamping;

        points.push({
          id: regionIdFor(points.length),
          row,
          column,
          isEdge,
          x: clamp(x, marginX, mapViewBox.width - marginX),
          y: clamp(y, marginY, mapViewBox.height - marginY)
        });
      }
    }

    return points;
  }

  function clipPolygonByBisector(polygon, site, other) {
    if (polygon.length === 0) return polygon;

    const a = 2 * (other.x - site.x);
    const b = 2 * (other.y - site.y);
    const c = (other.x * other.x) + (other.y * other.y) - (site.x * site.x) - (site.y * site.y);
    const clipped = [];

    function valueFor(point) {
      return (a * point.x) + (b * point.y) - c;
    }

    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const currentValue = valueFor(current);
      const previousValue = valueFor(previous);
      const currentInside = currentValue <= 0.0001;
      const previousInside = previousValue <= 0.0001;

      if (currentInside !== previousInside) {
        const ratio = previousValue / (previousValue - currentValue);
        clipped.push({
          x: previous.x + (current.x - previous.x) * ratio,
          y: previous.y + (current.y - previous.y) * ratio
        });
      }

      if (currentInside) {
        clipped.push(current);
      }
    }

    return clipped;
  }

  function fallbackPolygon(site) {
    const radius = 16;
    return [
      { x: site.x, y: site.y - radius },
      { x: site.x + radius, y: site.y },
      { x: site.x, y: site.y + radius },
      { x: site.x - radius, y: site.y }
    ];
  }

  function roundPoint(point) {
    return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
  }

  function edgeScoreForPoint(point) {
    const xRatio = point.x / mapViewBox.width;
    const yRatio = point.y / mapViewBox.height;
    return 1 - Math.min(xRatio, yRatio, 1 - xRatio, 1 - yRatio);
  }

  function vertexKey(point) {
    return `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`;
  }

  function pairKey(firstId, secondId) {
    return firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`;
  }

  function distanceSquared(first, second) {
    const dx = first.center.x - second.center.x;
    const dy = first.center.y - second.center.y;
    return (dx * dx) + (dy * dy);
  }

  function addNeighbor(first, second) {
    first.neighborSet.add(second.id);
    second.neighborSet.add(first.id);
  }

  function buildNeighbors(layouts) {
    const vertices = new Map();
    layouts.forEach((layout) => {
      layout.neighborSet = new Set();
      layout.polygon.forEach((point) => {
        const key = vertexKey(point);
        const owners = vertices.get(key) || [];
        owners.push(layout.id);
        vertices.set(key, owners);
      });
    });

    const pairCounts = new Map();
    vertices.forEach((owners) => {
      const uniqueOwners = Array.from(new Set(owners));
      for (let firstIndex = 0; firstIndex < uniqueOwners.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < uniqueOwners.length; secondIndex += 1) {
          const key = pairKey(uniqueOwners[firstIndex], uniqueOwners[secondIndex]);
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    });

    const layoutById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    pairCounts.forEach((count, key) => {
      if (count < 2) return;
      const [firstId, secondId] = key.split('|');
      addNeighbor(layoutById[firstId], layoutById[secondId]);
    });

    layouts.forEach((layout) => {
      const nearest = layouts
        .filter((candidate) => candidate.id !== layout.id)
        .sort((first, second) => distanceSquared(layout, first) - distanceSquared(layout, second));

      let index = 0;
      while (layout.neighborSet.size < 3 && nearest[index]) {
        addNeighbor(layout, nearest[index]);
        index += 1;
      }
    });

    layouts.forEach((layout) => {
      layout.neighbors = Array.from(layout.neighborSet).sort((firstId, secondId) => {
        return distanceSquared(layout, layoutById[firstId]) - distanceSquared(layout, layoutById[secondId]);
      });
      delete layout.neighborSet;
    });
  }

  function createOrganicLayout(width, height, seed, worldShape, mapSize) {
    const random = createRandom(`${seed}:${worldShape}:${mapSize}:organic-layout`);
    const boundary = rectangleBoundary();
    const sites = createSitePoints(width, height, seed, random);
    const layouts = sites.map((site, index) => {
      let polygon = boundary.map((point) => ({ ...point }));
      sites.forEach((other, otherIndex) => {
        if (index !== otherIndex && polygon.length > 0) {
          polygon = clipPolygonByBisector(polygon, site, other);
        }
      });

      if (polygon.length < 3) {
        polygon = fallbackPolygon(site);
      }

      return {
        id: site.id,
        index,
        name: `Region ${String(index + 1).padStart(3, '0')}`,
        grid: { x: site.column, y: site.row },
        isMapEdge: site.isEdge,
        center: roundPoint({ x: site.x, y: site.y }),
        polygon: polygon.map(roundPoint),
        edgeScore: edgeScoreForPoint(site),
        neighbors: []
      };
    });

    buildNeighbors(layouts);

    return { viewBox: { ...mapViewBox }, boundary: boundary.map(roundPoint), layouts };
  }

  namespace.mapGeometry = Object.freeze({
    rectangleBoundary,
    clamp,
    createSitePoints,
    clipPolygonByBisector,
    fallbackPolygon,
    roundPoint,
    edgeScoreForPoint,
    vertexKey,
    pairKey,
    distanceSquared,
    addNeighbor,
    buildNeighbors,
    createOrganicLayout
  });
})(window.EcoRuler = window.EcoRuler || {});
