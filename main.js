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
    var closeMenu = function () {
      links.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '開啟選單');
    };
    burger.onclick = function (e) {
      e.stopPropagation();
      var isOpen = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(isOpen));
      burger.setAttribute('aria-label', isOpen ? '關閉選單' : '開啟選單');
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        closeMenu();
        burger.focus();
      }
    });
    // 點導覽連結後收合
    links.querySelectorAll('a').forEach(function (a) {
      a.onclick = closeMenu;
    });
    // 捲動頁面時收合
    addEventListener('scroll', function () {
      if (links.classList.contains('open')) closeMenu();
    }, { passive: true });
    // 點選單面板以外的地方（主畫面）時收合
    document.addEventListener('click', function (e) {
      if (!links.classList.contains('open')) return;
      if (links.contains(e.target) || burger.contains(e.target)) return;
      closeMenu();
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
    var clickDetails = function (el) {
      var details = {
        link_url: el.getAttribute('href'),
        link_text: (el.textContent || '').trim()
      };
      if (el.dataset.campaign) {
        details.campaign_id = el.dataset.campaign;
        details.menu_type = el.dataset.intent || 'general';
        details.cta_placement = el.dataset.placement || 'unspecified';
      }
      return details;
    };
    document.querySelectorAll('a[href^="tel:"]').forEach(function (el) {
      el.addEventListener('click', function () {
        gtag('event', 'phone_call_click', clickDetails(el));
      });
    });
    document.querySelectorAll('a[href*="line.me"]').forEach(function (el) {
      el.addEventListener('click', function () {
        gtag('event', 'line_click', clickDetails(el));
      });
    });
    document.querySelectorAll('a[data-track="campaign_menu_click"]').forEach(function (el) {
      el.addEventListener('click', function () {
        gtag('event', 'campaign_menu_click', clickDetails(el));
      });
    });
  }
});
