/**
 * Nexlock — landing: animações de scroll (reveal + parallax cinematográfico).
 * CSS-first; este arquivo só orquestra o timing. Respeita prefers-reduced-motion.
 */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------
  // Reveal on scroll — adiciona .in quando o elemento entra na tela
  // ---------------------------------------------------------------
  const reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------
  // Parallax — desloca mídias (fotos/vídeos) conforme a rolagem
  // ---------------------------------------------------------------
  const items = [...document.querySelectorAll('[data-parallax]')];
  let ticking = false;

  function update() {
    const vh = window.innerHeight;
    for (const el of items) {
      const host = el.closest('.parallax-host') || el.parentElement;
      const r = host.getBoundingClientRect();
      // Distância do centro da seção ao centro da viewport.
      const center = r.top + r.height / 2 - vh / 2;
      const speed = parseFloat(el.dataset.parallax) || 0.1;
      const y = (-center * speed).toFixed(1);
      el.style.transform = `translate3d(0, ${y}px, 0) scale(1.2)`;
    }
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  if (!reduce && items.length) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  // ---------------------------------------------------------------
  // Alguns navegadores móveis ignoram autoplay até o primeiro gesto.
  // Tenta dar play nos vídeos assim que possível.
  // ---------------------------------------------------------------
  const videos = document.querySelectorAll('video');
  function kick() {
    videos.forEach((v) => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    });
  }
  kick();
  window.addEventListener('pointerdown', kick, { once: true });
  window.addEventListener('touchstart', kick, { once: true });
})();
