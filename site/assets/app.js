/* BFREEKY — player + keyboard. The release list itself is static HTML, so the page still
   works with JavaScript disabled (every row is a normal SoundCloud link). */
(function () {
  'use strict';

  var SC_API = 'https://w.soundcloud.com/player/api.js';
  var rows = Array.prototype.slice.call(document.querySelectorAll('.track'));
  var frame = document.getElementById('sc');
  var deck = document.getElementById('deck');
  var el = {
    idx: document.getElementById('p-idx'),
    title: document.getElementById('p-title'),
    meta: document.getElementById('p-meta'),
    cur: document.getElementById('t-cur'),
    dur: document.getElementById('t-dur'),
    fill: document.getElementById('fill'),
    knob: document.getElementById('knob'),
    seek: document.getElementById('seek'),
    play: document.getElementById('play'),
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    open: document.getElementById('p-open'),
    np: document.getElementById('np'),
    hint: document.getElementById('hint'),
    meter: document.getElementById('meter')
  };

  /* ── clock ─────────────────────────────────────────── */
  var clock = document.getElementById('clock');
  if (clock) {
    var tick = function () {
      try {
        clock.textContent = new Intl.DateTimeFormat('de-DE', {
          timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(new Date());
      } catch (e) {
        clock.textContent = new Date().toTimeString().slice(0, 8);
      }
    };
    tick();
    setInterval(tick, 1000);
  }
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ── player ────────────────────────────────────────── */
  var current = -1;
  var widget = null;
  var playing = false;
  var position = 0;
  var duration = 0;
  var poll = null;

  function mmss(ms) {
    ms = Math.max(0, Math.floor(ms / 1000));
    return ('0' + Math.floor(ms / 60)).slice(-2) + ':' + ('0' + (ms % 60)).slice(-2);
  }

  function dur(track) {
    var ms = parseInt(track.getAttribute('data-dur') || '0', 10);
    return ms > 0 ? ms : 0;
  }

  function paint(pos) {
    position = pos;
    var pct = duration ? Math.min(100, (pos / duration) * 100) : 0;
    if (el.fill) el.fill.style.width = pct.toFixed(2) + '%';
    if (el.knob) el.knob.style.left = pct.toFixed(2) + '%';
    if (el.cur) el.cur.textContent = mmss(pos);
    if (el.seek) el.seek.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function select(i, autoplay) {
    if (i < 0 || i >= rows.length) return;
    var track = rows[i];
    current = i;
    rows.forEach(function (r) { r.classList.remove('is-live'); });
    track.classList.add('is-live');

    var title = track.getAttribute('data-title') || '';
    var url = track.getAttribute('data-url') || '';
    duration = dur(track);

    if (el.idx) el.idx.textContent = ('0' + (i + 1)).slice(-2) + '/' + ('0' + rows.length).slice(-2);
    if (el.title) el.title.textContent = title.toUpperCase();
    if (el.meta) el.meta.textContent = (track.querySelector('.track__meta') || {}).textContent || '';
    if (el.dur) el.dur.textContent = mmss(duration);
    if (el.open) el.open.href = url;
    if (el.np) el.np.textContent = 'NOW: ' + title.toUpperCase();
    paint(0);

    if (!window.SC || !SC.Widget) { window.open(url, '_blank', 'noopener'); return; }
    if (!widget) { widget = SC.Widget(frame); bind(); }
    widget.load(url, {
      auto_play: autoplay !== false,
      show_artwork: false,
      visual: false,
      color: '#c8ff00',
      hide_related: true,
      show_comments: false,
      show_reposts: false,
      show_playcount: false,
      show_user: true,
      callback: function () {
        widget.getDuration(function (d) { if (d) { duration = d; if (el.dur) el.dur.textContent = mmss(d); } });
      }
    });
    if (autoplay !== false) startPoll();
  }

  function startPoll() {
    stopPoll();
    poll = setInterval(function () { if (widget) widget.getPosition(paint); }, 500);
  }
  function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

  function setPlaying(on) {
    playing = on;
    if (deck) deck.classList.toggle('is-playing', on);
    if (el.play) {
      el.play.innerHTML = on ? '&#10073;&#10073;' : '&#9654;';
      el.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }
    if (on) startPoll(); else stopPoll();
  }

  function bind() {
    var E = SC.Widget.Events;
    widget.bind(E.READY, function () {});
    widget.bind(E.PLAY, function () {
      setPlaying(true);
      widget.getDuration(function (d) { if (d) { duration = d; if (el.dur) el.dur.textContent = mmss(d); } });
    });
    widget.bind(E.PAUSE, function () { setPlaying(false); });
    widget.bind(E.FINISH, function () { setPlaying(false); next(); });
    widget.bind(E.PLAY_PROGRESS, function (e) {
      if (e && typeof e.currentPosition === 'number') paint(e.currentPosition);
    });
    widget.bind(E.ERROR, function () {
      setPlaying(false);
      if (el.meta) el.meta.textContent = 'PLAYER FEHLER · AUF SOUNDCLOUD ÖFFNEN';
    });
  }

  function toggle() {
    if (!widget) { if (current < 0 && rows.length) select(0, true); return; }
    if (playing) { widget.pause(); setPlaying(false); }
    else { widget.play(); setPlaying(true); }
  }
  function next() {
    if (!rows.length) return;
    select((current + 1) % rows.length, playing || current >= 0 ? true : true);
  }
  function prev() {
    if (!rows.length) return;
    select((current - 1 + rows.length) % rows.length, true);
  }

  rows.forEach(function (row, i) {
    row.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
      ev.preventDefault();
      select(i, true);
      if (window.innerWidth < 1000 && deck) deck.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  if (el.play) el.play.addEventListener('click', toggle);
  if (el.next) el.next.addEventListener('click', function () { next(); });
  if (el.prev) el.prev.addEventListener('click', function () { prev(); });

  if (el.seek) {
    var seekTo = function (ev) {
      var box = el.seek.getBoundingClientRect();
      var pct = Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width));
      if (widget && duration) { widget.seekTo(Math.round(pct * duration)); paint(pct * duration); }
    };
    el.seek.addEventListener('click', seekTo);
    el.seek.addEventListener('keydown', function (ev) {
      if (!widget || !duration) return;
      if (ev.key === 'ArrowRight') { widget.seekTo(Math.min(duration, position + 5000)); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft') { widget.seekTo(Math.max(0, position - 5000)); ev.preventDefault(); }
    });
  }

  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (ev.code === 'Space' || ev.key === 'k') { ev.preventDefault(); toggle(); }
  });

  /* fallback: no SoundCloud API script -> rows stay plain links, player says so */
  if (window.setTimeout) {
    setTimeout(function () {
      if (!window.SC || !SC.Widget) {
        if (el.title) el.title.textContent = 'PLAYER OFFLINE';
        if (el.meta) el.meta.textContent = 'TRACKS ÖFFNEN AUF SOUNDCLOUD';
        if (el.hint) el.hint.classList.add('deck__hint--fallback');
      } else if (!widget) {
        widget = SC.Widget(frame);
        bind();
      }
    }, 2500);
  }
})();
