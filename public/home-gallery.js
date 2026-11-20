(function () {
  function mount({container, features, index, onChange, announce}) {
    container.innerHTML = `<section class="gallery" aria-label="Tempo features">
      <h1 class="sr-only">Tempo features</h1>
      <p class="sr-only" id="gallery-instructions">Scroll or drag to browse horizontally. Gradients move within their frames. Select a card to expand it. Use arrow keys to browse, and Escape to leave the overview.</p>
      <div class="gallery-stage" aria-describedby="gallery-instructions">${features.map((p, i) => `
        <a href="#/${p.slug}" class="gallery-card" data-feature="${i}" aria-label="Open ${p.title}" draggable="false">
          <div class="gallery-image"><img src="${p.art}" width="4800" height="1350" alt="" draggable="false" decoding="async" ${i === index ? 'fetchpriority="high"' : ''}></div>
          <span class="gallery-label">${p.title}</span>
        </a>`).join('')}<div class="gallery-slide-stack" aria-hidden="true" inert></div></div>
      <button class="step-button prev" aria-label="Previous feature"><span class="cross"></span></button>
      <button class="step-button next" aria-label="Next feature"><span class="cross"></span></button>
      <span class="overview-marker cross" aria-hidden="true"></span>
      <div class="gallery-footer">
        <button class="gallery-hint" aria-label="Toggle gallery overview">Scroll to explore</button>
        <div class="pagination"><span id="current-number">${index + 1}</span><span class="separator">—</span>${features.length}</div>
        <div class="thumbnail-strip" aria-label="Choose a feature">${features.map((p, i) => `<button class="thumbnail" data-index="${i}" aria-label="Show ${p.title}" aria-pressed="${i === index}"><img src="${p.art}" alt="" draggable="false"></button>`).join('')}</div>
      </div>
    </section>`;

    const gallery = container.querySelector('.gallery');
    const stage = gallery.querySelector('.gallery-stage');
    const cards = [...gallery.querySelectorAll('.gallery-card')];
    const pictures = cards.map(card => card.querySelector('.gallery-image'));
    const slideStack = gallery.querySelector('.gallery-slide-stack');
    const slideLayers = new Map();
    const thumbnails = [...gallery.querySelectorAll('.thumbnail')];
    const number = gallery.querySelector('#current-number');
    const strip = gallery.querySelector('.thumbnail-strip');
    const hint = gallery.querySelector('.gallery-hint');
    const marker = gallery.querySelector('.overview-marker');
    const previous = gallery.querySelector('.prev');
    const next = gallery.querySelector('.next');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = new GalleryMotion.Motion({count: features.length, index,
      width: gallery.clientWidth, height: gallery.clientHeight, reducedMotion: reduced.matches});
    const lifecycle = new AbortController();
    const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, {...options, signal: lifecycle.signal});
    let raf = 0, lastFrame = 0, pointer = null, suppressClickUntil = 0, activeIndex = -1, disposed = false;

    function syncMode() {
      gallery.classList.toggle('overview', motion.open);
      strip.inert = motion.open;
      strip.setAttribute('aria-hidden', String(motion.open));
      previous.tabIndex = next.tabIndex = motion.open ? -1 : 0;
      previous.setAttribute('aria-hidden', String(motion.open));
      next.setAttribute('aria-hidden', String(motion.open));
      hint.textContent = motion.open ? 'Scroll or drag to explore' : 'Scroll to explore';
    }
    function syncSelection() {
      const active = motion.open ? motion.nearest : motion.selected;
      if (active === activeIndex) return;
      activeIndex = active;
      const p = features[active];
      number.textContent = active + 1;
      thumbnails.forEach((button, i) => {
        button.classList.toggle('active', i === active);
        button.setAttribute('aria-pressed', String(i === active));
      });
      onChange(active);
      announce(`${active + 1} of ${features.length}. ${p.title}`);
    }
    function style(element, property, value) {
      if (element.style[property] !== value) element.style[property] = value;
    }
    function draw(frames) {
      thumbnails.forEach(thumbnail => style(thumbnail, 'width', motion.size.thumbWidth + 'px'));
      frames.forEach((frame, i) => {
        const card = cards[i];
        style(card, 'width', `${frame.width.toFixed(3)}px`);
        style(card, 'height', `${frame.height.toFixed(3)}px`);
        style(card, 'transform', `translate3d(${frame.x.toFixed(3)}px,${frame.y.toFixed(3)}px,0)`);
        style(card, 'visibility', frame.visible ? 'visible' : 'hidden');
        style(card, 'zIndex', motion.slide ? (i === motion.slideBase ? '1' : '0') : (i === motion.selected ? '1' : '2'));
        style(pictures[i], 'width', `${frame.imageWidth.toFixed(3)}px`);
        style(pictures[i], 'transform', `translate3d(${frame.imageX.toFixed(3)}px,0,0)`);
        const accessible = motion.open ? frame.visible : i === motion.selected;
        card.tabIndex = accessible ? 0 : -1;
        card.setAttribute('aria-hidden', String(!accessible));
        card.setAttribute('aria-label', `${motion.open ? 'Expand' : 'Open'} ${features[i].title}`);
      });
      drawSlides();
      const opacity = Math.max(0, 1 - motion.openness * 4);
      style(strip, 'opacity', String(Math.max(0, 1 - motion.openness * 5)));
      style(previous, 'opacity', String(opacity));
      style(next, 'opacity', String(opacity));
      style(marker, 'opacity', String(Math.max(0, motion.openness * 2 - 1)));
      syncSelection();
    }
    function drawSlides() {
      const frames = motion.slideFrames();
      const activeIds = new Set(frames.map(frame => frame.id));
      for (const [id, layer] of slideLayers) {
        if (!activeIds.has(id)) {
          layer.remove();
          slideLayers.delete(id);
        }
      }
      for (const frame of frames) {
        let layer = slideLayers.get(frame.id);
        if (!layer) {
          // Each click needs its own layer, even when returning to the same feature.
          layer = document.createElement('div');
          layer.className = 'gallery-card';
          const picture = pictures[frame.to].cloneNode(true);
          picture.style.width = '100%';
          picture.style.transform = 'none';
          layer.append(picture, cards[frame.to].querySelector('.gallery-label').cloneNode(true));
          slideStack.append(layer);
          slideLayers.set(frame.id, layer);
        }
        style(layer, 'width', `${frame.width.toFixed(3)}px`);
        style(layer, 'height', `${frame.height.toFixed(3)}px`);
        style(layer, 'transform', `translate3d(${frame.x.toFixed(3)}px,0,0)`);
      }
    }
    function tick(time) {
      raf = 0;
      if (disposed) return;
      const dt = lastFrame ? (time - lastFrame) / 1000 : 1 / 60;
      lastFrame = time;
      draw(motion.step(dt));
      if (motion.moving) raf = requestAnimationFrame(tick);
      else lastFrame = 0;
    }
    function wake() {
      if (!raf && !disposed) { lastFrame = 0; raf = requestAnimationFrame(tick); }
    }
    function overview(open) {
      motion.setOverview(open);
      syncMode();
      wake();
    }
    function expand(i) {
      motion.expand(i);
      syncMode();
      syncSelection();
      wake();
    }
    function select(i, expandCard = !motion.open) {
      const destination = (i + features.length) % features.length;
      if (expandCard && !motion.open) {
        motion.slideTo(destination, i < motion.selected ? -1 : 1);
        syncMode();
        syncSelection();
        wake();
      }
      else if (expandCard) expand(destination);
      else { motion.goTo(i); wake(); }
    }
    function step(direction) {
      const destination = Math.round(motion.target / motion.size.step) + direction;
      select(destination);
    }

    listen(gallery, 'wheel', event => {
      if (event.ctrlKey) return;
      const delta = GalleryMotion.wheelDelta(event, motion.size.width);
      if (!delta) return;
      event.preventDefault();
      // Only the opening event changes modes. Every following fraction of
      // input is retained, including input during the opening animation.
      if (!motion.open) overview(true);
      else { motion.scrollBy(delta); wake(); }
    }, {passive: false});

    listen(window, 'keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        overview(false);
      }
      if (event.key === 'Enter' && event.target === document.body) {
        location.hash = '/' + features[motion.selected].slug;
      }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        step(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
      }
    });

    listen(gallery, 'pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
      motion.velocity = 0;
      pointer = {id: event.pointerId, x: event.clientX, y: event.clientY,
        lastX: event.clientX, lastY: event.clientY, time: event.timeStamp,
        moved: false, axis: null, velocity: 0};
    });
    listen(window, 'pointermove', event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = pointer.x - event.clientX, dy = pointer.y - event.clientY;
      if (!pointer.moved && Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
      if (!pointer.moved) {
        pointer.moved = true;
        pointer.axis = event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
        gallery.setPointerCapture(event.pointerId);
        if (!motion.open) overview(true);
        motion.dragging = true;
        gallery.classList.add('dragging');
      }
      const delta = pointer.axis === 'x' ? pointer.lastX - event.clientX : pointer.lastY - event.clientY;
      const elapsed = Math.max(8, event.timeStamp - pointer.time);
      pointer.velocity = pointer.velocity * .25 + (delta / elapsed * 1000) * .75;
      motion.scrollBy(delta);
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.time = event.timeStamp;
      event.preventDefault();
      wake();
    }, {passive: false});
    function endDrag(event, cancelled = false) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (pointer.moved) {
        suppressClickUntil = performance.now() + 350;
        motion.dragging = false;
        const recent = event.timeStamp - pointer.time < 100;
        motion.fling(!cancelled && recent ? pointer.velocity : 0);
        gallery.classList.remove('dragging');
        if (gallery.hasPointerCapture(event.pointerId)) gallery.releasePointerCapture(event.pointerId);
        wake();
      }
      pointer = null;
    }
    listen(window, 'pointerup', event => endDrag(event));
    listen(window, 'pointercancel', event => endDrag(event, true));
    listen(gallery, 'lostpointercapture', event => endDrag(event, true));
    listen(gallery, 'click', event => {
      if ((motion.slide && event.target.closest('.gallery-card')) || (event.detail && performance.now() < suppressClickUntil)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, {capture: true});
    cards.forEach((card, i) => listen(card, 'click', event => {
      if (motion.open || i !== motion.selected) { event.preventDefault(); expand(i); }
    }));
    thumbnails.forEach((button, i) => listen(button, 'click', () => select(i)));
    listen(previous, 'click', () => step(-1));
    listen(next, 'click', () => step(1));
    listen(hint, 'click', () => overview(!motion.open));
    cards.forEach((card, i) => listen(card, 'focus', () => {
      if (motion.open) { motion.goTo(i); wake(); }
    }));
    listen(stage, 'dragstart', event => event.preventDefault());
    listen(window, 'resize', () => {
      motion.resize(gallery.clientWidth, gallery.clientHeight);
      draw(motion.frames());
      wake();
    });
    listen(reduced, 'change', () => {
      motion.reducedMotion = reduced.matches;
      motion.velocity = 0;
      wake();
    });
    listen(document, 'visibilitychange', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
      if (!document.hidden) wake();
    });
    syncMode();
    draw(motion.frames());
    return {select, step, overview, destroy() {
      disposed = true;
      lifecycle.abort();
      if (raf) cancelAnimationFrame(raf);
    }};
  }
  window.TempoGallery = {mount};
})();
