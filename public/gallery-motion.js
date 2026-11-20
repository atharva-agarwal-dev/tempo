/* Gallery geometry adapted from the local Camille portfolio blueprint. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const damping = (dt, seconds) => 1 - Math.exp(-dt / seconds);
  const rectMix = (a, b, t) => ({
    x: mix(a.x, b.x, t), y: mix(a.y, b.y, t),
    width: mix(a.width, b.width, t), height: mix(a.height, b.height, t)
  });

  function metrics(width, height, count) {
    const mobile = width <= 760;
    const cardWidth = width * (mobile ? .64 : .21875);
    const gap = mobile ? 16 : width * .01875;
    const cardHeight = height * (mobile ? .48 : 5 / 9);
    const margin = mobile ? 24 : width >= 1600 ? 50 : 40;
    const thumbGaps = 4 * (count - 1);
    const thumbWidth = mobile ? (width - margin * 2 - thumbGaps) / count
      : Math.min(clamp(width * .0472, 38, 80), (width * .45 - margin - thumbGaps) / count);
    const thumbHeight = width >= 1600 ? 44 : 35;
    const thumbLeft = mobile ? (width - (thumbWidth * count + 4 * (count - 1))) / 2
      : width - margin - thumbWidth * count - 4 * (count - 1);
    return {width, height, cardWidth, cardHeight, gap, step: cardWidth + gap,
      top: mobile ? height * .23 : (height - cardHeight) / 2,
      thumbWidth, thumbHeight, thumbLeft,
      thumbTop: height - (mobile ? 28 : width >= 1600 ? 50 : 39) - thumbHeight};
  }

  function wheelDelta(event, pageSize) {
    // Keep trackpad fractions, both axes, and line/page-mode mouse wheels.
    // Ctrl+wheel is the browser's zoom gesture and must not be intercepted.
    if (event.ctrlKey) return 0;
    const value = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageSize : 1;
    return Number.isFinite(value) ? value * unit * .85 : 0;
  }

  const slideDuration = 1.2;
  const slideProgress = elapsed => 1 - Math.pow(1 - clamp(elapsed / slideDuration, 0, 1), 4);

  class Motion {
    constructor({count, index = 0, width, height, reducedMotion = false}) {
      this.count = count;
      this.selected = clamp(index, 0, count - 1);
      this.size = metrics(width, height, count);
      this.position = this.target = this.selected * this.size.step;
      this.open = false;
      this.openness = 0;
      this.velocity = 0;
      this.dragging = false;
      this.reducedMotion = reducedMotion;
      this.slides = [];
      this.slideBase = null;
      this.nextSlideId = 0;
      this.layout = Array.from({length: count}, (_, i) => this.fullRect(i));
    }
    get max() { return (this.count - 1) * this.size.step; }
    get nearest() { return clamp(Math.round(this.position / this.size.step), 0, this.count - 1); }
    get slide() { return this.slides[this.slides.length - 1] ?? null; }
    fullRect(index, selected = this.selected) {
      const s = this.size;
      return index === selected ? {x: 0, y: 0, width: s.width, height: s.height}
        : {x: s.thumbLeft + index * (s.thumbWidth + 4), y: s.thumbTop,
          width: s.thumbWidth, height: s.thumbHeight};
    }
    railRect(index) {
      const s = this.size;
      return {x: (s.width - s.cardWidth) / 2 + index * s.step, y: s.top,
        width: s.cardWidth, height: s.cardHeight};
    }
    setOverview(open) {
      if (this.slide) {
        this.layout = this.frames().map(({x, y, width, height}) => ({x, y, width, height}));
        for (const frame of this.slideFrames()) {
          this.layout[frame.to] = {x: frame.x, y: frame.y, width: frame.width, height: frame.height};
        }
        this.position = this.target = this.selected * this.size.step;
        this.slides = [];
        this.slideBase = null;
      }
      this.open = open;
      this.velocity = 0;
      if (!open) this.expand(this.nearest);
    }
    expand(index) {
      this.slides = [];
      this.slideBase = null;
      this.selected = clamp(index, 0, this.count - 1);
      this.target = this.selected * this.size.step;
      this.open = false;
      this.velocity = 0;
    }
    slideTo(index, direction) {
      const destination = clamp(index, 0, this.count - 1);
      this.target = destination * this.size.step;
      if (this.open || this.openness > .001 || this.reducedMotion) {
        this.expand(destination);
        return;
      }
      if (destination === this.selected) return;
      if (!this.slides.length) this.slideBase = this.selected;
      this.slides.push({
        id: this.nextSlideId++, from: this.selected, to: destination,
        direction: direction < 0 ? -1 : 1, elapsed: 0,
      });
      this.openness = 0;
      this.selected = destination;
      this.position = this.target;
      this.velocity = 0;
    }
    scrollBy(delta) {
      this.velocity = 0;
      this.target = clamp(this.target + delta, 0, this.max);
    }
    goTo(index) {
      this.velocity = 0;
      this.target = clamp(index, 0, this.count - 1) * this.size.step;
    }
    fling(pixelsPerSecond) {
      this.velocity = this.reducedMotion ? 0 : clamp(pixelsPerSecond, -2800, 2800);
    }
    resize(width, height) {
      const oldStep = this.size.step;
      this.size = metrics(width, height, this.count);
      const ratio = this.size.step / oldStep;
      this.position = clamp(this.position * ratio, 0, this.max);
      this.target = clamp(this.target * ratio, 0, this.max);
      this.velocity *= ratio;
      this.layout = this.layout.map((_, i) => rectMix(this.fullRect(i), this.railRect(i), this.openness));
    }
    step(dt) {
      dt = clamp(dt, 0, .064);
      if (this.slide) {
        let coveredThrough = -1;
        this.slides.forEach((slide, index) => {
          slide.elapsed += dt;
          if (slide.elapsed >= slideDuration || this.reducedMotion) coveredThrough = index;
        });
        // A completed layer covers the viewport, so only layers above it still need rendering.
        if (coveredThrough >= 0) {
          this.slideBase = this.slides[coveredThrough].to;
          this.slides.splice(0, coveredThrough + 1);
        }
        if (!this.slides.length) {
          this.slideBase = null;
          this.position = this.target = this.selected * this.size.step;
          this.layout = this.layout.map((_, i) => this.fullRect(i));
        }
        return this.frames();
      }
      if (!this.dragging && Math.abs(this.velocity) > 1) {
        const decay = Math.exp(-dt / .24);
        this.target = clamp(this.target + this.velocity * .24 * (1 - decay), 0, this.max);
        this.velocity *= decay;
        if (this.target === 0 || this.target === this.max) this.velocity = 0;
      } else if (!this.dragging) this.velocity = 0;
      const follow = this.reducedMotion ? 1 : damping(dt, this.dragging ? .035 : .10);
      const morph = this.reducedMotion ? 1 : damping(dt, .14);
      this.position = mix(this.position, this.target, follow);
      this.openness = mix(this.openness, Number(this.open), morph);
      if (Math.abs(this.target - this.position) < .01) this.position = this.target;
      if (Math.abs(Number(this.open) - this.openness) < .0001) this.openness = Number(this.open);
      this.layout = this.layout.map((rect, i) => {
        const dest = this.open ? this.railRect(i) : this.fullRect(i);
        const next = rectMix(rect, dest, morph);
        return Math.max(...Object.keys(next).map(k => Math.abs(next[k] - dest[k]))) < .01 ? dest : next;
      });
      return this.frames();
    }
    frames() {
      return this.layout.map((base, index) => {
        if (this.slide) {
          base = this.fullRect(index, this.slideBase);
        }
        const frame = {...base, x: base.x - this.position * this.openness};
        // The frame travels at full speed. Its oversized image counters 26%
        // of that movement, so the gradient travels at 74% of frame speed.
        const distance = this.size.width / 2 - (frame.x + frame.width / 2);
        const rate = this.reducedMotion ? 0 : .26 * this.openness;
        const overscan = rate * (this.size.width + frame.width) / 2;
        const shift = clamp(distance * rate, -overscan, overscan);
        return {...frame, index, imageWidth: frame.width + 2 * overscan,
          imageX: -overscan + shift, parallax: shift,
          visible: frame.x + frame.width >= -2 && frame.x <= this.size.width + 2};
      });
    }
    slideFrames() {
      return this.slides.map(slide => ({
        id: slide.id, to: slide.to,
        x: slide.direction * this.size.width * (1 - slideProgress(slide.elapsed)),
        y: 0, width: this.size.width, height: this.size.height,
      }));
    }
    get moving() {
      if (this.slide) return true;
      if (Math.abs(this.velocity) > 1 || Math.abs(this.position - this.target) > .01
        || Math.abs(Number(this.open) - this.openness) > .0001) return true;
      return this.layout.some((rect, i) => {
        const dest = this.open ? this.railRect(i) : this.fullRect(i);
        return Object.keys(rect).some(k => Math.abs(rect[k] - dest[k]) > .01);
      });
    }
  }
  return {Motion, metrics, wheelDelta};
});
