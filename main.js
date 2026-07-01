// Shared site behavior (nav, footer year, opening-hours highlight, reveal-on-scroll, GA4 click tracking)
document.addEventListener('DOMContentLoaded', function () {
  // footer year
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  // highlight today's opening hours (0=Sun -> row index 6), only present on pages with .hours table
  (function () {
    var rows = document.querySelectorAll('.hours tr');
    if (!rows.length) return;
    var map = [6, 0, 1, 2, 3, 4, 5]; // JS getDay() -> row order (Mon first)
    var r = rows[map[new Date().getDay()]];
    if (r) r.classList.add('today');
  })();

  // nav scroll style
  var nav = document.getElementById('nav');
  if (nav) {
    addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', scrollY > 40);
    });
  }

  // burger menu
  var burger = document.getElementById('burger'), links = document.getElementById('navlinks');
  if (burger && links) {
    burger.onclick = function () { links.classList.toggle('open'); };
    links.querySelectorAll('a').forEach(function (a) {
      a.onclick = function () { links.classList.remove('open'); };
    });
  }

  // reveal on scroll
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: .15 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // GA4 click tracking: phone, LINE
  if (typeof gtag === 'function') {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (el) {
      el.addEventListener('click', function () {
        gtag('event', 'phone_call_click', {
          link_url: el.getAttribute('href'),
          link_text: (el.textContent || '').trim()
        });
      });
    });
    document.querySelectorAll('a[href*="line.me"]').forEach(function (el) {
      el.addEventListener('click', function () {
        gtag('event', 'line_click', {
          link_url: el.getAttribute('href'),
          link_text: (el.textContent || '').trim()
        });
      });
    });
  }
});
