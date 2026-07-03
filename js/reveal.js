/* Subtle scroll-in reveal. Only hides elements that are BELOW the fold, so if this
   script fails to run, nothing is ever left invisible. Respects reduced-motion. */
(function () {
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var supported = "IntersectionObserver" in window && !reduce;
  var io = supported
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 })
    : null;

  function run(scope) {
    var els = (scope || document).querySelectorAll("[data-reveal]:not(.is-in):not(.reveal)");
    Array.prototype.forEach.call(els, function (e) {
      if (!supported) { e.classList.add("is-in"); return; }
      // Already on-screen (e.g. above the fold)? Show immediately, no animation.
      if (e.getBoundingClientRect().top < window.innerHeight * 0.9) { e.classList.add("is-in"); return; }
      e.classList.add("reveal");
      io.observe(e);
    });
  }

  window.CL60Reveal = run;
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", function () { run(); });
})();
