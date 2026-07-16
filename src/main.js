(function bootEcoRuler(namespace) {
  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("app");
    if (!root) {
      throw new Error("Eco Ruler app root was not found.");
    }
    namespace.mountApp(root);
  });
})(window.EcoRuler = window.EcoRuler || {});
