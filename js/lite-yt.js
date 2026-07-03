/* Lightweight YouTube facade: show a thumbnail + play button and only load the
   (heavy) nocookie player iframe on click. Massively improves page load —
   nothing from YouTube is fetched until the visitor actually presses play. */
(function () {
  function mount(el) {
    var id = el.getAttribute("data-id");
    if (!id || el.classList.contains("lite-yt--loaded")) return;
    var f = document.createElement("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0&autoplay=1";
    f.title = el.getAttribute("data-title") || "Video";
    f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    f.setAttribute("allowfullscreen", "");
    el.innerHTML = "";
    el.appendChild(f);
    el.classList.add("lite-yt--loaded");
  }
  function init(root) {
    (root || document).querySelectorAll(".lite-yt:not(.lite-yt--loaded)").forEach(function (el) {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("click", function () { mount(el); });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mount(el); }
      });
    });
  }
  window.CL60LiteYT = init;
  init();
})();
