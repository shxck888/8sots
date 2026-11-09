document.addEventListener('DOMContentLoaded', function () {
  var dialog = document.getElementById('poster-viewer');
  if (!dialog) return;
  var image = dialog.querySelector('img');
  var body = dialog.querySelector('.poster-viewer-body');
  var zoomButton = dialog.querySelector('[data-poster-zoom]');
  var closeButton = dialog.querySelector('[data-poster-close]');
  var opener;
  var previousOverflow;

  function resetZoom() {
    body.classList.remove('is-zoomed');
    zoomButton.setAttribute('aria-pressed', 'false');
    zoomButton.textContent = '放大';
    body.scrollTop = 0;
    body.scrollLeft = 0;
  }

  function toggleZoom() {
    var zoomed = body.classList.toggle('is-zoomed');
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.textContent = zoomed ? '縮小' : '放大';
  }

  document.querySelectorAll('[data-poster-src]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      if (dialog.open) return;
      opener = trigger;
      image.src = trigger.dataset.posterSrc;
      image.alt = trigger.querySelector('img').alt;
      resetZoom();
      previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      closeButton.focus({ preventScroll: true });
      if (typeof gtag === 'function') {
        gtag('event', 'campaign_menu_click', {
          campaign_id: trigger.dataset.campaign,
          menu_type: trigger.dataset.intent,
          cta_placement: 'poster',
          link_url: trigger.dataset.posterSrc,
          link_text: '同頁放大海報'
        });
      }
    });
  });

  closeButton.addEventListener('click', function () { dialog.close(); });
  zoomButton.addEventListener('click', toggleZoom);
  image.addEventListener('click', toggleZoom);
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  // Native dialog supplies Escape dismissal, focus trapping and an inert background.
  dialog.addEventListener('close', function () {
    document.body.style.overflow = previousOverflow;
    resetZoom();
    if (opener) opener.focus({ preventScroll: true });
  });
});
