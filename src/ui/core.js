(function initializeUiCore(namespace) {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function terrainById(terrainId) {
    return namespace.data.terrainTypes.find((terrain) => terrain.id === terrainId);
  }

  function traitById(traitId) {
    return namespace.resources.naturalTraitById[traitId];
  }

  function resourceById(resourceId) {
    return namespace.resources.resourceById[resourceId];
  }

  function resourceSiteByResourceId(resourceId) {
    return namespace.resources.resourceSiteByResourceId[resourceId] || null;
  }

  function resourceSiteById(siteId) {
    return namespace.resources.resourceSiteById[siteId] || null;
  }

  function fallbackResourceSite(resource) {
    const label = resource ? resource.label : 'Resource';
    const resourceId = resource ? resource.id : 'resource';
    return {
      id: `${resourceId}-site`,
      resourceId,
      label: `${label} Site`,
      group: 'Resource Site',
      workerType: 'Workers',
      role: 'Prototype resource site.'
    };
  }

  function siteForResource(resourceId) {
    const resource = resourceById(resourceId);
    return resourceSiteByResourceId(resourceId) || fallbackResourceSite(resource);
  }

  function worldProfileById(profileId) {
    return namespace.data.worldProfiles.find((profile) => profile.id === profileId) || namespace.data.worldProfiles[0];
  }

  function worldShapeById(shapeId) {
    return namespace.data.worldShapes.find((shape) => shape.id === shapeId) || namespace.data.worldShapes[0];
  }

  function mapSizeById(sizeId) {
    return namespace.data.mapSizes.find((size) => size.id === sizeId) || namespace.data.mapSizes[0];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }


  namespace.uiCore = Object.freeze({
    escapeHtml,
    escapeAttribute,
    terrainById,
    traitById,
    resourceById,
    resourceSiteByResourceId,
    resourceSiteById,
    fallbackResourceSite,
    siteForResource,
    worldProfileById,
    worldShapeById,
    mapSizeById,
    clamp
  });
})(window.EcoRuler = window.EcoRuler || {});
