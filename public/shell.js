'use strict';

window.TempoShell = (() => {
  const features = [
    { slug: 'weekly', title: 'Weekly', gradient: '01-weekly' },
    { slug: 'timepad', title: 'Timepad', gradient: '03-focus' },
    { slug: 'focus', title: 'Focus', gradient: '05-habits' },
    { slug: 'notes', title: 'Notes', gradient: '10-ristretto' },
    { slug: 'habits', title: 'Habits', gradient: '13-cocoa' },
    { slug: 'goals', title: 'Goals', gradient: '15-hazelnut' },
    { slug: 'reflect', title: 'Reflect', gradient: '16-mocha' },
    { slug: 'explore', title: 'Explore', gradient: '17-sienna' },
    { slug: 'ritual', title: 'Ritual', gradient: '19-dusk' },
    { slug: 'archive', title: 'Archive', gradient: '20-velvet' },
  // The image files have the blur baked in, so gallery resizing does not rerun SVG filters.
  ].map(feature => ({ ...feature, art: 'gradients/options/' + feature.gradient + '.jpg' }));

  let current = 0;
  let activeView;
  let gallery;
  let aboutCleanup;

  function currentView() {
    const slug = location.hash.replace(/^#\/?/, '').split('?')[0];
    return slug === 'about' || features.some(feature => feature.slug === slug) ? slug : 'home';
  }

  function setupAbout() {
    const content = document.getElementById('about-content');
    const miniature = document.getElementById('about-miniature');
    miniature.replaceChildren(content.cloneNode(true));
    const clone = miniature.firstElementChild;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const scroller = document.getElementById('about');
    const map = document.getElementById('about-map');
    const windowFrame = document.getElementById('about-map-window');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lifecycle = new AbortController();
    const update = () => {
      const total = scroller.scrollHeight;
      const mapHeight = map.clientHeight;
      const visibleHeight = Math.min(mapHeight, Math.max(36, scroller.clientHeight / total * mapHeight));
      const progress = scroller.scrollTop / Math.max(1, total - scroller.clientHeight);
      windowFrame.style.height = visibleHeight + 'px';
      windowFrame.style.transform = 'translateY(' + progress * (mapHeight - visibleHeight) + 'px)';
      const scale = map.clientWidth / content.clientWidth;
      miniature.style.transform = 'scale(' + scale + ')';
      miniature.style.width = content.clientWidth + 'px';
    };
    map.querySelectorAll('[data-about-target]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById(button.dataset.aboutTarget).scrollIntoView({
          behavior: reduced.matches ? 'instant' : 'smooth', block: 'start',
        });
      }, { signal: lifecycle.signal });
    });
    scroller.addEventListener('scroll', update, { passive: true, signal: lifecycle.signal });
    window.addEventListener('resize', update, { signal: lifecycle.signal });
    update();
    return () => lifecycle.abort();
  }

  function render(view) {
    if (activeView === view) return;
    gallery?.destroy();
    gallery = undefined;
    aboutCleanup?.();
    aboutCleanup = undefined;
    activeView = view;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());

    const tool = view === 'weekly' || view === 'timepad';
    const placeholder = features.find(feature => feature.slug === view && !tool);
    document.body.dataset.view = tool ? 'planner' : view;
    document.getElementById('planner').hidden = !tool;
    document.getElementById('home').hidden = view !== 'home';
    document.getElementById('about').hidden = view !== 'about';
    document.getElementById('feature-placeholder').hidden = !placeholder;
    document.getElementById('announcement').textContent = '';

    for (const name of ['home', 'about']) {
      const link = document.getElementById(name + '-link');
      if (name === (view === 'about' ? 'about' : 'home')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    const selected = features.findIndex(feature => feature.slug === view);
    if (selected >= 0) current = selected;
    document.title = (view === 'home' ? 'Tempo' : view === 'about' ? 'About — Tempo' : features[current].title + ' — Tempo');
    if (view === 'home') {
      gallery = TempoGallery.mount({
        container: document.getElementById('home'), features, index: current,
        onChange: index => { current = index; },
        announce: text => { document.getElementById('announcement').textContent = text; },
      });
    }
    if (view === 'about') aboutCleanup = setupAbout();
    if (placeholder) {
      document.getElementById('placeholder-title').textContent = placeholder.title;
      document.getElementById('feature-placeholder').style.setProperty('--feature-art', 'url("' + placeholder.art + '")');
    }
    if (document.activeElement !== document.body) document.activeElement.blur();
    if (view !== 'home') {
      const target = tool ? document.getElementById(view === 'weekly' ? 'week-title' : 'timepad-title')
        : document.getElementById(placeholder ? 'placeholder-title' : 'about-title');
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  return { currentView, render };
})();
