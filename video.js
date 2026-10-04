/* Tonal video: photos on a timeline become a short MP4 with slow camera moves,
   dissolves, the current look and simple text. Loaded on demand by index.html,
   which provides window.Tonal. Everything runs in this browser. */
(function(){
'use strict';

var T = window.Tonal;
var $ = function(id){ return document.getElementById(id); };

/* ============================== settings ============================== */

var FORMATS = [
  { id:'16x9', name:'Landscape', ratio:'16:9', w:1920, h:1080 },
  { id:'9x16', name:'Vertical',  ratio:'9:16', w:1080, h:1920 },
  { id:'4x5',  name:'Portrait',  ratio:'4:5',  w:1080, h:1350 },
  { id:'1x1',  name:'Square',    ratio:'1:1',  w:1080, h:1080 }
];

// Seconds per photo, transition length, how far a push-in zooms, how far a pan travels.
var PACES = [
  { id:'luxury',   name:'Luxury',   dur:4.5, trans:1.2, zoom:0.10, pan:0.14 },
  { id:'standard', name:'Standard', dur:3.5, trans:0.9, zoom:0.12, pan:0.18 },
  { id:'quick',    name:'Quick',    dur:2.5, trans:0.5, zoom:0.14, pan:0.22 }
];
var MOTIONS = [['auto', 'Auto'], ['in', 'Push in'], ['out', 'Pull out'], ['left', 'Pan left'],
               ['right', 'Pan right'], ['up', 'Rise'], ['still', 'Still']];
var MOTION_BADGE = { in:'In', out:'Out', left:'←', right:'→', up:'↑', still:'Still' };
var TRANSITIONS = [['dissolve', 'Dissolve'], ['dip', 'Through black'], ['cut', 'Cut']];
var FPS = 30, FADE_IN = 0.6, FADE_OUT = 1.0, DEFAULT_LENGTH = 60, PREVIEW_EDGE = 1280, MAX_DUR = 8;

var settings = {
  format:'16x9', pace:'luxury', transition:'dissolve', letterbox:false,
  text:{ openTitle:'', openSub:'', closeTitle:'', closeSub:'', font:'serif', size:'m', pos:'centre', colour:'white' }
};
(function restore(s){
  if(!s) return;
  ['format', 'pace', 'transition', 'letterbox'].forEach(function(k){ if(k in s) settings[k] = s[k]; });
  if(s.text) Object.keys(settings.text).forEach(function(k){ if(k in s.text) settings.text[k] = s.text[k]; });
})(T.savedVideo());

function save(){ T.saveVideo(JSON.parse(JSON.stringify(settings))); }
function byId(list, id){ return list.filter(function(x){ return x.id === id; })[0] || list[0]; }
function format(){ return byId(FORMATS, settings.format); }
function pace(){ return byId(PACES, settings.pace); }
// How long a dissolve or a dip through black lasts, and how much neighbouring photos overlap.
function transLen(){ return settings.transition === 'cut' ? 0 : pace().trans; }
function overlap(){ return settings.transition === 'dissolve' ? pace().trans : 0; }
function minDur(){ return Math.max(2, Math.round((overlap() + 0.6)*10)/10); }

function clamp01(v){ return Math.min(1, Math.max(0, v)); }
function smooth(x){ x = clamp01(x); return x*x*(3 - 2*x); }
function lerp(a, b, t){ return a + (b - a)*t; }
// Camera moves keep some speed at their ends, so a dissolve never shows a frozen photo.
function ease(p){ return 0.75*p + 0.25*smooth(p); }
function mmss(t){ var s = Math.round(t); return Math.floor(s/60) + ':' + ('0' + s%60).slice(-2); }

/* ============================== timeline ============================== */

var clips = [];     // { item, dur, motion, focus:{x,y}, caption, iw, ih }
var seen = [];      // photos the timeline already knows about
var segs = [], total = 0, selected = -1;

function newClip(it){ return { item:it, dur:pace().dur, motion:'auto', focus:{ x:0.5, y:0.5 }, caption:'' }; }
function clipOf(it){ return clips.filter(function(c){ return c.item === it; })[0]; }

// A first timeline: every photo if they fit about a minute at this pace,
// otherwise an even spread across the set (a mix of outside, inside, aerial).
function defaultClips(){
  var photos = T.photos(), P = pace(), ov = overlap();
  var fit = Math.max(1, Math.floor((DEFAULT_LENGTH - ov)/(P.dur - ov)));
  var pick = photos;
  if(photos.length > fit){
    pick = [];
    for(var i = 0; i < fit; i++) pick.push(photos[Math.round(i*(photos.length - 1)/Math.max(1, fit - 1))]);
  }
  clips = pick.map(newClip);
  seen = photos.slice();
}

// Keeps the timeline in step with the loaded photos: removed photos drop out,
// photos added since join the end.
function sync(){
  var photos = T.photos();
  clips = clips.filter(function(c){ return photos.indexOf(c.item) >= 0; });
  seen = seen.filter(function(it){ return photos.indexOf(it) >= 0; });
  previews = previews.filter(function(p){
    if(photos.indexOf(p.item) >= 0) return true;
    if(p.bm) p.bm.close();
    return false;
  });
  if(!clips.length) defaultClips();
  else photos.forEach(function(it){ if(seen.indexOf(it) < 0){ seen.push(it); clips.push(newClip(it)); } });
  if(selected >= clips.length) selected = clips.length - 1;
  layout();
}

function layout(){
  var ov = overlap(), t = 0;
  segs = clips.map(function(c, i){
    var s = { clip:c, index:i, start:t, end:t + c.dur };
    t += c.dur - ov;
    return s;
  });
  total = segs.length ? segs[segs.length - 1].end : 0;
}

// Which photos are on screen at time t and how opaque, and how dark the frame
// is: it fades in from black, out to black, and dips between photos.
function stateAt(t){
  var tl = transLen(), half = tl/2, layers = [], dark = 0;
  segs.forEach(function(s){
    if(t < s.start || t >= s.end) return;
    var alpha = 1;
    if(settings.transition === 'dissolve' && s.index > 0) alpha = smooth((t - s.start)/tl);
    if(settings.transition === 'dip'){
      if(s.index > 0 && t < s.start + half) dark = Math.max(dark, 1 - (t - s.start)/half);
      if(s.index < segs.length - 1 && t > s.end - half) dark = Math.max(dark, (t - (s.end - half))/half);
    }
    layers.push({ seg:s, p:clamp01((t - s.start)/s.clip.dur), alpha:alpha });
  });
  if(t < FADE_IN) dark = Math.max(dark, 1 - t/FADE_IN);
  if(t > total - FADE_OUT) dark = Math.max(dark, (t - (total - FADE_OUT))/FADE_OUT);
  return { layers:layers, dark:clamp01(dark) };
}

/* ============================== camera moves ============================== */

// Auto picks varied moves: sideways pans when a tall frame shows a wide photo,
// rises when a wide frame shows a tall photo, otherwise push in, pan, pull out.
function autoMotion(seg){
  var f = format(), c = seg.clip;
  var wide = (c.iw || c.item.w || 3) >= (c.ih || c.item.h || 2), tall = f.h > f.w;
  var seq = tall && wide ? ['right', 'in', 'left', 'out', 'right', 'left']
          : !tall && !wide ? ['up', 'in', 'up', 'out']
          : ['in', 'right', 'out', 'left', 'in', 'up'];
  return seq[seg.index % seq.length];
}
function motionOf(seg){ return seg.clip.motion === 'auto' ? autoMotion(seg) : seg.clip.motion; }

// The part of an iw x ih photo on screen at eased progress e, as [x, y, w, h]
// fractions. frameFor (from the crop tool) fits the video's shape inside the
// photo and keeps it there; push-ins head for the photo's focus point.
function viewAt(seg, e, iw, ih){
  var c = seg.clip, f = format(), P = pace(), cp = { w:f.w, h:f.h };
  var fx = c.focus.x, fy = c.focus.y, m = motionOf(seg), a, b;
  if(m === 'in' || m === 'out'){
    var wide = { cx:0.5, cy:0.5, zoom:1 }, close = { cx:fx, cy:fy, zoom:1 + P.zoom };
    a = m === 'in' ? wide : close;
    b = m === 'in' ? close : wide;
  }else if(m === 'still'){
    a = { cx:fx, cy:fy, zoom:1.03 };
    b = { cx:fx, cy:fy, zoom:1.03 + P.zoom*0.3 };
  }else{
    // pans: zoom in a little for room, then travel across what's there
    var z = 1 + P.zoom*0.8, across = m === 'left' || m === 'right';
    var probe = T.frameFor({ cx:0.5, cy:0.5, zoom:z }, iw, ih, cp);
    var size = across ? probe[2] : probe[3];
    var travel = Math.min(1 - size, P.pan*(across && f.h > f.w ? 2 : 1));
    var mid = Math.min(Math.max(across ? fx : fy, size/2 + travel/2), 1 - size/2 - travel/2);
    var from = mid + travel/2, to = mid - travel/2;   // left and up head towards 0
    if(m === 'right'){ var swap = from; from = to; to = swap; }
    a = across ? { cx:from, cy:fy, zoom:z } : { cx:fx, cy:from, zoom:z };
    b = across ? { cx:to, cy:fy, zoom:z } : { cx:fx, cy:to, zoom:z };
  }
  return T.frameFor({ cx:lerp(a.cx, b.cx, e), cy:lerp(a.cy, b.cy, e), zoom:lerp(a.zoom, b.zoom, e) }, iw, ih, cp);
}

/* ============================== drawing ============================== */

var stage = $('stage'), vCanvas = $('vCanvas'), vctx = vCanvas.getContext('2d');
var glc = document.createElement('canvas');
var R = T.createRenderer(glc);
R.init();
glc.addEventListener('webglcontextlost', function(e){ e.preventDefault(); });
glc.addEventListener('webglcontextrestored', function(){ R.init(); textures = []; refresh(); });

var SIZES = { s:0.05, m:0.064, l:0.082 };
function serifFont(px){ return '500 ' + Math.round(px) + 'px Newsreader, Georgia, serif'; }
function sansFont(px, bold){ return (bold ? '600 ' : '500 ') + Math.round(px) + 'px Geist, -apple-system, "Segoe UI", sans-serif'; }
function fontsReady(){
  if(!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([document.fonts.load(serifFont(48)), document.fonts.load(sansFont(48, true)),
                      document.fonts.load(sansFont(48, false))]).catch(function(){});
}

// Cinematic bars: crop a 16:9 frame to 2.39:1.
function barHeight(W, H){ return settings.letterbox && format().id === '16x9' ? Math.round((H - W/2.39)/2) : 0; }

// When each piece of text is on screen, in seconds.
function textTimes(){
  var tx = settings.text, ov = overlap(), out = [];
  if(!segs.length) return out;
  var openFrom = FADE_IN + 0.15;
  var openTo = Math.max(openFrom + 2, Math.min(segs[0].end - ov/2, openFrom + 3.2));
  var hasOpen = !!(tx.openTitle || tx.openSub), hasClose = !!(tx.closeTitle || tx.closeSub);
  var closeTo = total - 0.1, closeFrom = Math.max(closeTo - 3.6, hasOpen ? openTo + 0.4 : 0);
  if(hasOpen) out.push({ from:openFrom, to:openTo, title:tx.openTitle, sub:tx.openSub });
  if(hasClose && closeTo - closeFrom > 1) out.push({ from:closeFrom, to:closeTo, title:tx.closeTitle, sub:tx.closeSub });
  segs.forEach(function(s){
    if(!s.clip.caption) return;
    var from = s.start + (s.index ? ov : FADE_IN) + 0.3, to = s.end - ov - 0.3;
    if(hasOpen && s.index === 0) from = Math.max(from, openTo + 0.2);
    if(hasClose && s.index === segs.length - 1) to = Math.min(to, closeFrom - 0.2);
    if(to - from >= 1) out.push({ from:from, to:to, title:s.clip.caption, caption:true });
  });
  return out;
}

function drawText(ctx, W, H, t){
  var tx = settings.text, unit = Math.min(W, H), bar = barHeight(W, H), tall = H > W*1.2;
  // keep clear of the bars, and of the top and bottom of vertical videos where Reels and Stories put their buttons
  var margin = unit*0.07;
  var bottom = H - (tall ? H*0.22 : bar + unit*0.08);
  var size = unit*SIZES[tx.size];
  textTimes().forEach(function(w){
    var a = clamp01(Math.min((t - w.from)/0.6, (w.to - t)/0.5));
    if(a <= 0) return;
    var rest = 1 - clamp01((t - w.from)/0.9);   // text rises into place, easing out
    paintBlock(ctx, W, H, w, a, rest*rest*unit*0.02, margin, bottom, w.caption ? size*0.42 : size);
  });
}

function paintBlock(ctx, W, H, w, alpha, lift, margin, bottom, size){
  var tx = settings.text, light = tx.colour === 'white';
  var pos = w.caption && tx.pos === 'centre' ? 'bottom-centre' : tx.pos;
  var x = pos === 'bottom-left' ? margin : W/2, maxW = W - margin*2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = pos === 'bottom-left' ? 'left' : 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = light ? '#ffffff' : '#141414';
  ctx.shadowColor = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)';
  ctx.shadowBlur = Math.max(4, size*0.35);
  var subSize = w.caption ? 0 : size*0.3, spacing = w.caption ? size*0.2 : subSize*0.24;
  var title = w.caption ? w.title.toUpperCase() : w.title, sub = w.sub ? w.sub.toUpperCase() : '';
  var titleFont = w.caption ? sansFont(size, true) : tx.font === 'serif' ? serifFont(size) : sansFont(size*0.86, false);
  // titles shrink to fit on one line
  ctx.font = titleFont;
  if('letterSpacing' in ctx) ctx.letterSpacing = w.caption ? spacing + 'px' : '0px';
  var tw = title ? ctx.measureText(title).width : 0;
  if(tw > maxW){
    var scale = maxW/tw;
    titleFont = w.caption ? sansFont(size*scale, true) : tx.font === 'serif' ? serifFont(size*scale) : sansFont(size*0.86*scale, false);
    ctx.font = titleFont;
  }
  var capH = size*0.72, gap = size*0.55 + subSize*1.1, titleY;
  if(pos === 'centre') titleY = H/2 + capH/2 - (sub ? gap/2 : 0);
  else titleY = bottom - (sub ? gap : 0);
  if(title) ctx.fillText(title, x, titleY + lift);
  if(sub){
    ctx.font = sansFont(subSize, true);
    if('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    ctx.fillText(sub, x, (title ? titleY + gap : titleY) + lift);
  }
  ctx.restore();
}

var shownView = null;   // where the selected photo sits on screen in the last preview frame

// One frame of the video at time t, drawn into ctx (W x H). texFor(clip) gives
// the photo's texture, or nothing yet. The preview and the export share this.
function paintFrame(ctx, W, H, t, seed, texFor, grade){
  t = Math.min(Math.max(t, 0), Math.max(0, total - 1e-4));
  var st = stateAt(t), drawn = 0;
  st.layers.forEach(function(L){
    var tex = texFor(L.seg.clip);
    if(!tex) return;
    var view = viewAt(L.seg, ease(L.p), tex.w, tex.h);
    if(L.seg.index === selected) shownView = view;
    R.draw(W, H, tex, 1, grade, { region:view, frame:view, aspect:tex.w/tex.h, alpha:drawn ? L.alpha : 1, seed:seed });
    drawn++;
  });
  if(drawn) ctx.drawImage(glc, 0, 0, W, H);
  else{ ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  var bar = barHeight(W, H);
  if(bar){ ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); }
  drawText(ctx, W, H, t);
  if(st.dark > 0){ ctx.fillStyle = 'rgba(0,0,0,' + st.dark + ')'; ctx.fillRect(0, 0, W, H); }
}

/* ============================== preview ============================== */

// Small copies of the timeline's photos (1600 px), decoded one at a time, and
// the most recent few on the GPU.
var previews = [], textures = [], loadingPreview = false;

function previewOf(it){ return previews.filter(function(p){ return p.item === it; })[0]; }

function loadPreviews(){
  if(loadingPreview) return;
  var next = clips.map(function(c){ return c.item; }).filter(function(it){ return !previewOf(it); })[0];
  if(!next) return;
  loadingPreview = true;
  var rec = { item:next, bm:null, failed:false };
  previews.push(rec);
  T.decode(next.file, 1600).then(function(bm){
    rec.bm = bm;
    clips.forEach(function(c){ if(c.item === next){ c.iw = bm.width; c.ih = bm.height; } });
  }).catch(function(){ rec.failed = true; }).then(function(){
    loadingPreview = false;
    if(active){ if(dragFrom < 0) buildTrack(); refresh(); }
    loadPreviews();
  });
}

function previewTex(clip){
  var p = previewOf(clip.item);
  if(!p || !p.bm) return null;
  for(var i = 0; i < textures.length; i++){
    if(textures[i].item === clip.item){ var hit = textures.splice(i, 1)[0]; textures.push(hit); return hit.tex; }
  }
  var tex = R.texture(p.bm);
  textures.push({ item:clip.item, tex:tex });
  while(textures.length > 6) R.release(textures.shift().tex);
  return tex;
}

var active = false, playing = false, pos = 0, clock = 0, clockPos = 0, drawQueued = false;

function previewSize(){
  var f = format(), s = Math.min(1, PREVIEW_EDGE/Math.max(f.w, f.h));
  return [Math.round(f.w*s), Math.round(f.h*s)];
}

function refresh(){
  if(!active || drawQueued || playing) return;
  drawQueued = true;
  requestAnimationFrame(function(){ drawQueued = false; drawPreview(); });
}

function drawPreview(){
  if(!active || exporting) return;
  var sz = previewSize();
  if(vCanvas.width !== sz[0]) vCanvas.width = sz[0];
  if(vCanvas.height !== sz[1]) vCanvas.height = sz[1];
  shownView = null;
  paintFrame(vctx, sz[0], sz[1], pos, Math.floor(pos*FPS), previewTex, T.grade());
  if(playing){   // get the next photo onto the GPU before its dissolve starts
    var next = segs.filter(function(s){ return s.start > pos; })[0];
    if(next) previewTex(next.clip);
  }
  $('vTime').textContent = mmss(pos) + ' / ' + mmss(total);
  var scrub = $('vScrub');
  scrub.value = total ? pos/total : 0;
  T.paintRange(scrub);
  placeHead();
  placeFocus();
}

function play(){
  if(!clips.length || exporting) return;
  if(pos >= total - 0.05) pos = 0;
  playing = true;
  clock = performance.now(); clockPos = pos;
  updatePlay();
  requestAnimationFrame(tick);
}
function pause(){ playing = false; updatePlay(); refresh(); }
function tick(now){
  if(!playing || !active) return;
  pos = clockPos + (now - clock)/1000;
  if(pos >= total){ pos = total; playing = false; updatePlay(); }
  drawPreview();
  if(playing) requestAnimationFrame(tick);
}
function seek(t){
  pos = Math.min(Math.max(t, 0), total);
  if(playing){ clock = performance.now(); clockPos = pos; }
  refresh();
}
function updatePlay(){ $('vPlay').textContent = playing ? 'Pause' : 'Play'; }

// The playhead runs along the timeline cards.
function placeHead(){
  var head = $('vHead'), box = $('vClips');
  if(!head || !segs.length){ if(head) head.hidden = true; return; }
  var cur = null;
  segs.forEach(function(s){ if(pos >= s.start) cur = s; });
  var card = cur && box.children[cur.index];
  if(!card){ head.hidden = true; return; }
  head.hidden = false;
  head.style.left = (card.offsetLeft + clamp01((pos - cur.start)/cur.clip.dur)*card.offsetWidth) + 'px';
}

// The selected photo's focus point, drawn where it sits in the current frame.
function placeFocus(){
  var mk = $('vFocus'), c = clips[selected];
  var on = !playing && c && shownView;
  stage.classList.toggle('picking', !!on);
  if(!on){ mk.hidden = true; return; }
  var v = shownView, px = (c.focus.x - v[0])/v[2], py = (c.focus.y - v[1])/v[3];
  if(px < 0 || px > 1 || py < 0 || py > 1){ mk.hidden = true; return; }
  var r = vCanvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
  mk.style.left = (r.left - s.left + px*r.width) + 'px';
  mk.style.top = (r.top - s.top + py*r.height) + 'px';
  mk.hidden = false;
}

// Clicking the paused photo sets what its camera move heads towards.
vCanvas.addEventListener('click', function(e){
  var c = clips[selected];
  if(playing || !c || !shownView || exporting) return;
  var r = vCanvas.getBoundingClientRect(), v = shownView;
  c.focus = { x:clamp01(v[0] + (e.clientX - r.left)/r.width*v[2]), y:clamp01(v[1] + (e.clientY - r.top)/r.height*v[3]) };
  refresh();
});

function bindPlayer(){
  $('vPlay').addEventListener('click', function(){ playing ? pause() : play(); });
  $('vScrub').addEventListener('input', function(e){ seek(parseFloat(e.target.value)*total); });
  $('vExportBtn').addEventListener('click', exportVideo);
  window.addEventListener('resize', function(){ if(active){ placeHead(); placeFocus(); } });
}

/* ============================== timeline cards ============================== */

var dragFrom = -1;

function el(tag, cls, text){
  var e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text != null) e.textContent = text;
  return e;
}

function buildTrack(){
  var box = $('vClips');
  box.textContent = '';
  clips.forEach(function(c, i){
    var w = el('div', 'vclip');
    w.draggable = !exporting;
    var b = el('button', 'vthumb');
    b.type = 'button';
    b.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
    b.setAttribute('aria-label', 'Photo ' + (i + 1) + ': ' + c.item.name);
    var img = el('img'); img.alt = '';
    if(c.item.thumb) img.src = c.item.thumb;
    b.appendChild(img);
    b.appendChild(el('span', 'vbadge dur', c.dur.toFixed(1) + 's'));
    b.appendChild(el('span', 'vbadge mo', MOTION_BADGE[motionOf(segs[i])]));
    b.addEventListener('click', function(){ select(i); });
    var x = el('button', 'x', '×');
    x.type = 'button';
    x.title = 'Remove from the video';
    x.setAttribute('aria-label', 'Remove ' + c.item.name + ' from the video');
    x.addEventListener('click', function(){ removeClip(i); });
    w.appendChild(b); w.appendChild(x);
    w.addEventListener('dragstart', function(e){
      if(exporting){ e.preventDefault(); return; }
      dragFrom = i; w.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    });
    w.addEventListener('dragend', function(){ dragFrom = -1; buildTrack(); });
    w.addEventListener('dragover', function(e){
      if(dragFrom < 0) return;
      e.preventDefault();
      Array.prototype.forEach.call(box.children, function(n){ n.classList.remove('over'); });
      w.classList.add('over');
    });
    w.addEventListener('drop', function(e){
      if(dragFrom < 0) return;
      e.preventDefault();
      var from = dragFrom;
      dragFrom = -1;
      moveClip(from, i);
    });
    box.appendChild(w);
  });
  var head = el('div', 'vhead'); head.id = 'vHead';
  box.appendChild(head);
  $('vCount').textContent = countText();
  placeHead();
}

function countText(){ return clips.length + (clips.length === 1 ? ' photo · ' : ' photos · ') + mmss(total); }

function select(i){
  selected = i >= 0 && i < clips.length ? i : -1;
  Array.prototype.forEach.call($('vClips').querySelectorAll('.vthumb'), function(b, k){
    b.setAttribute('aria-pressed', k === selected ? 'true' : 'false');
  });
  buildClipSec();
  if(selected >= 0){
    pause();
    var s = segs[selected];
    seek(s.start + s.clip.dur/2);
    $('paneVideo').scrollTop = 0;
  }
  refresh();
}

/* ============================== editing ============================== */

// Everything that changes the timeline goes through here, so the preview,
// cards, panel and export line stay in step.
function changed(rebuildClip){
  layout();
  if(pos > total) pos = total;
  buildTrack();
  buildPick();
  if(rebuildClip) buildClipSec();
  $('vLen').textContent = mmss(total);
  updateExport();
  save();
  refresh();
}

function removeClip(i){
  if(exporting) return;
  clips.splice(i, 1);
  if(selected === i) selected = -1;
  else if(selected > i) selected--;
  changed(true);
}

function moveClip(from, to){
  if(exporting || from === to || to < 0 || to >= clips.length) return;
  var c = clips.splice(from, 1)[0];
  clips.splice(to, 0, c);
  if(selected === from) selected = to;
  else if(from < selected && to >= selected) selected--;
  else if(from > selected && to <= selected) selected++;
  changed(true);
}

function toggleItem(it){
  if(exporting) return;
  var c = clipOf(it);
  if(c) removeClip(clips.indexOf(c));
  else{ clips.push(newClip(it)); changed(false); loadPreviews(); }
}

// Spreads the photos evenly so the video lasts about this long.
function fitTo(seconds){
  if(exporting || !clips.length) return;
  var n = clips.length, ov = overlap();
  var want = (seconds + (n - 1)*ov)/n;
  var d = Math.round(Math.min(MAX_DUR, Math.max(minDur(), want))*10)/10;
  clips.forEach(function(c){ c.dur = d; });
  changed(true);
  if(Math.abs(d - want) > 0.05){
    T.say(want > d ? 'That needs more photos: each one is already at the ' + MAX_DUR + ' s maximum.'
                   : 'That needs fewer photos: each one is already as short as it can be.', false);
  }
}

/* ============================== panel ============================== */

function section(title, valueId){
  var s = el('div', 'vsec'), h = el('h3', 'section-title');
  h.appendChild(document.createTextNode(title));
  if(valueId){ var b = el('b'); b.id = valueId; h.appendChild(b); }
  s.appendChild(h);
  return s;
}

function choice(options, current, onPick, cls){
  var g = el('div', cls || 'seg');
  g.setAttribute('role', 'group');
  options.forEach(function(o){
    var b = el('button', '', o[1]);
    b.type = 'button';
    b.dataset.v = o[0];
    b.setAttribute('aria-pressed', o[0] === current ? 'true' : 'false');
    b.addEventListener('click', function(){
      if(exporting) return;
      Array.prototype.forEach.call(g.children, function(n){ n.setAttribute('aria-pressed', n === b ? 'true' : 'false'); });
      onPick(o[0]);
    });
    g.appendChild(b);
  });
  return g;
}

function label(text){ return el('span', 'vlabel', text); }

function textInput(key, placeholder){
  var i = el('input', 'vinput');
  i.type = 'text';
  i.maxLength = 60;
  i.placeholder = placeholder;
  i.value = settings.text[key];
  i.setAttribute('aria-label', placeholder);
  i.addEventListener('input', function(){ settings.text[key] = i.value; save(); refresh(); });
  return i;
}

function buildPanel(){
  var p = $('vPanel');
  p.textContent = '';

  var clipSec = el('div', 'vsec');
  clipSec.id = 'vClipSec';
  p.appendChild(clipSec);

  var shape = section('Shape');
  var grid = el('div', 'crops');
  FORMATS.forEach(function(f){
    var b = el('button', 'crop');
    b.type = 'button';
    b.dataset.v = f.id;
    b.setAttribute('aria-pressed', f.id === settings.format ? 'true' : 'false');
    b.appendChild(T.glyph({ w:f.w, h:f.h }));
    var t = el('span', 't');
    t.appendChild(el('b', '', f.name));
    t.appendChild(el('small', '', f.ratio));
    b.appendChild(t);
    b.addEventListener('click', function(){
      if(exporting) return;
      settings.format = f.id;
      Array.prototype.forEach.call(grid.children, function(n){ n.setAttribute('aria-pressed', n === b ? 'true' : 'false'); });
      $('vBars').hidden = f.id !== '16x9';
      changed(false);
    });
    grid.appendChild(b);
  });
  shape.appendChild(grid);
  p.appendChild(shape);

  var paceSec = section('Pace', 'vLen');
  paceSec.appendChild(choice(PACES.map(function(x){ return [x.id, x.name]; }), settings.pace, function(v){
    settings.pace = v;
    clips.forEach(function(c){ c.dur = pace().dur; });
    changed(true);
  }));
  var fits = el('div', 'vfits');
  fits.appendChild(document.createTextNode('Fit to'));
  var fitChips = el('div', 'vchips');
  [30, 45, 60].forEach(function(s){
    var b = el('button', '', s + ' s');
    b.type = 'button';
    b.addEventListener('click', function(){ fitTo(s); });
    fitChips.appendChild(b);
  });
  fits.appendChild(fitChips);
  paceSec.appendChild(fits);
  p.appendChild(paceSec);

  var trans = section('Transitions');
  trans.appendChild(choice(TRANSITIONS, settings.transition, function(v){
    settings.transition = v;
    clips.forEach(function(c){ c.dur = Math.max(c.dur, minDur()); });
    changed(true);
  }));
  var bars = el('label', 'vtoggle');
  bars.id = 'vBars';
  bars.hidden = settings.format !== '16x9';
  var cb = el('input');
  cb.type = 'checkbox';
  cb.checked = settings.letterbox;
  cb.addEventListener('change', function(){ settings.letterbox = cb.checked; save(); refresh(); });
  bars.appendChild(cb);
  bars.appendChild(document.createTextNode('Cinematic bars'));
  trans.appendChild(bars);
  p.appendChild(trans);

  var text = section('Text');
  text.appendChild(label('Opening'));
  text.appendChild(textInput('openTitle', 'Title'));
  text.appendChild(textInput('openSub', 'Subtitle'));
  text.appendChild(label('Closing'));
  text.appendChild(textInput('closeTitle', 'Title'));
  text.appendChild(textInput('closeSub', 'Subtitle, e.g. a name or website'));
  var restyle = function(key){ return function(v){ settings.text[key] = v; save(); refresh(); }; };
  text.appendChild(label('Font'));
  text.appendChild(choice([['serif', 'Serif'], ['sans', 'Sans']], settings.text.font, restyle('font')));
  text.appendChild(label('Size'));
  text.appendChild(choice([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], settings.text.size, restyle('size')));
  text.appendChild(label('Position'));
  text.appendChild(choice([['centre', 'Centre'], ['bottom-left', 'Bottom left'], ['bottom-centre', 'Bottom centre']], settings.text.pos, restyle('pos')));
  text.appendChild(label('Colour'));
  text.appendChild(choice([['white', 'White'], ['black', 'Black']], settings.text.colour, restyle('colour')));
  p.appendChild(text);

  var pick = section('Photos in the video', 'vPickCount');
  var pickGrid = el('div', 'vpick');
  pickGrid.id = 'vPick';
  pick.appendChild(pickGrid);
  p.appendChild(pick);

  $('vLen').textContent = mmss(total);
}

// Settings for the selected photo, at the top of the panel.
function buildClipSec(){
  var box = $('vClipSec');
  if(!box) return;
  box.textContent = '';
  var c = clips[selected];
  box.hidden = !c;
  if(!c) return;
  var h = el('h3', 'section-title');
  h.appendChild(document.createTextNode('Photo ' + (selected + 1) + ' of ' + clips.length));
  var done = el('button', 'linkbtn', 'Done');
  done.type = 'button';
  done.addEventListener('click', function(){ select(-1); });
  h.appendChild(done);
  box.appendChild(h);

  var row = el('div', 'row');
  var lab = el('label', '', 'Duration');
  lab.htmlFor = 'vDur';
  var val = el('span', 'val', c.dur.toFixed(1) + ' s');
  var dur = el('input');
  dur.type = 'range'; dur.id = 'vDur';
  dur.min = minDur(); dur.max = MAX_DUR; dur.step = 0.1; dur.value = c.dur;
  dur.addEventListener('input', function(){
    if(exporting) return;
    c.dur = parseFloat(dur.value);
    val.textContent = c.dur.toFixed(1) + ' s';
    layout();
    var badge = $('vClips').children[selected].querySelector('.dur');
    if(badge) badge.textContent = c.dur.toFixed(1) + 's';
    $('vCount').textContent = countText();
    $('vLen').textContent = mmss(total);
    updateExport();
    seek(segs[selected].start + c.dur/2);
  });
  row.appendChild(lab); row.appendChild(val); row.appendChild(dur);
  box.appendChild(row);
  T.paintRange(dur);

  box.appendChild(label('Camera move'));
  box.appendChild(choice(MOTIONS, c.motion, function(v){
    c.motion = v;
    var badge = $('vClips').children[selected].querySelector('.mo');
    if(badge) badge.textContent = MOTION_BADGE[motionOf(segs[selected])];
    seek(segs[selected].start + c.dur/2);
  }, 'vchips'));

  box.appendChild(label('Caption'));
  var cap = el('input', 'vinput');
  cap.type = 'text'; cap.maxLength = 40;
  cap.placeholder = 'Optional, e.g. the room';
  cap.value = c.caption;
  cap.setAttribute('aria-label', 'Caption for this photo');
  cap.addEventListener('input', function(){ c.caption = cap.value; refresh(); });
  box.appendChild(cap);

  var btns = el('div', 'vbtns');
  [['Move earlier', function(){ moveClip(selected, selected - 1); }],
   ['Move later', function(){ moveClip(selected, selected + 1); }],
   ['Remove', function(){ removeClip(selected); }]].forEach(function(a){
    var b = el('button', 'btn', a[0]);
    b.type = 'button';
    b.addEventListener('click', a[1]);
    btns.appendChild(b);
  });
  box.appendChild(btns);
  var hint = el('p', 'small', 'Click the photo to choose what the camera moves towards.');
  hint.style.marginTop = '10px';
  box.appendChild(hint);
}

// Every loaded photo, ticked and numbered if it's in the video.
function buildPick(){
  var box = $('vPick');
  if(!box) return;
  box.textContent = '';
  var photos = T.photos();
  $('vPickCount').textContent = clips.length + ' of ' + photos.length;
  photos.forEach(function(it){
    var c = clipOf(it), b = el('button');
    b.type = 'button';
    b.title = it.name;
    b.setAttribute('aria-pressed', c ? 'true' : 'false');
    b.setAttribute('aria-label', (c ? 'Remove ' : 'Add ') + it.name);
    var img = el('img'); img.alt = '';
    if(it.thumb) img.src = it.thumb;
    b.appendChild(img);
    if(c) b.appendChild(el('span', 'n', String(clips.indexOf(c) + 1)));
    b.addEventListener('click', function(){ toggleItem(it); });
    box.appendChild(b);
  });
}

// While exporting, the timeline and panel are read-only.
function lock(on){
  ['vPanel', 'vClips'].forEach(function(id){
    Array.prototype.forEach.call($(id).querySelectorAll('button, input'), function(n){ n.disabled = on; });
  });
  Array.prototype.forEach.call($('vClips').children, function(n){ n.draggable = !on; });
  $('vPlay').disabled = on;
  $('vScrub').disabled = on;
}

/* ============================== export ============================== */

var exporting = null, exportPos = 0;

function bitrateFor(f){ return Math.round(10e6*(f.w*f.h)/(1920*1080)); }

function setProgress(frac){
  var bar = $('vProgress');
  if(frac === null){ bar.classList.remove('on'); return; }
  bar.classList.add('on');
  $('vProgressBar').style.width = Math.round(frac*100) + '%';
}

function updateExport(){
  var btn = $('vExportBtn'), f = format();
  if(exporting){
    $('vInfo').textContent = 'Rendering ' + mmss(exportPos) + ' of ' + mmss(total) + '…';
    btn.textContent = 'Cancel';
    btn.classList.remove('primary');
    btn.disabled = false;
    return;
  }
  var mb = Math.max(1, Math.round(bitrateFor(f)*total/8/1e6));
  $('vInfo').textContent = clips.length
    ? f.ratio + ' · 1080p · 30 fps · ' + mmss(total) + ' · about ' + mb + ' MB'
    : 'Add photos to make a video.';
  btn.textContent = 'Export video';
  btn.classList.add('primary');
  btn.disabled = !clips.length || T.busy();
}

// Export decodes photos at up to 3840 px only while they're on screen, plus the
// next one so a dissolve never waits. A few big textures at a time, at most.
async function exportTextures(t, cache, failed){
  var need = stateAt(t).layers.map(function(L){ return L.seg.clip; });
  var next = segs.filter(function(s){ return s.start > t; })[0];
  if(next) need.push(next.clip);
  for(var i = 0; i < need.length; i++){
    var c = need[i];
    if(cache.some(function(e){ return e.clip === c; })) continue;
    var entry = { clip:c, tex:null };
    cache.push(entry);
    try{
      var bm = await T.decode(c.item.file, 3840);
      entry.tex = R.texture(bm);
      bm.close();
    }catch(e){
      if(failed.indexOf(c.item.name) < 0) failed.push(c.item.name);
    }
  }
  for(var j = cache.length - 1; j >= 0; j--){
    if(need.indexOf(cache[j].clip) < 0){ R.release(cache[j].tex); cache.splice(j, 1); }
  }
}

async function exportVideo(){
  if(exporting){ exporting.cancelled = true; return; }
  if(!clips.length || T.busy()) return;
  var job = exporting = { cancelled:false };
  pause();
  T.setBusy(true);
  T.say('');
  lock(true);
  var f = format(), W = f.w, H = f.h, frames = Math.max(1, Math.round(total*FPS));
  var grade = T.grade(), cache = [], failed = [], output = null;
  exportPos = 0;
  setProgress(0);
  updateExport();
  try{
    var MB = await import('./vendor/mediabunny-mp4.min.mjs');
    var quality = new MB.Quality({ bitrate:bitrateFor(f) });
    var codec = await MB.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width:W, height:H, quality:quality });
    if(!codec) throw new Error('this browser can’t encode video. Try a current Chrome, Edge, Safari or Firefox on a computer.');
    await fontsReady();
    var comp = document.createElement('canvas');
    comp.width = W; comp.height = H;
    var ctx = comp.getContext('2d');
    output = new MB.Output({ format:new MB.Mp4OutputFormat({ fastStart:'in-memory' }), target:new MB.BufferTarget() });
    var source = new MB.CanvasSource(comp, { codec:codec, quality:quality, keyFrameInterval:2 });
    output.addVideoTrack(source, { frameRate:FPS });
    await output.start();
    var texFor = function(c){
      for(var k = 0; k < cache.length; k++) if(cache[k].clip === c) return cache[k].tex;
      return null;
    };
    for(var i = 0; i < frames && !job.cancelled; i++){
      var t = i/FPS;
      await exportTextures(t, cache, failed);
      paintFrame(ctx, W, H, t, i, texFor, grade);
      await source.add(t, 1/FPS);
      exportPos = t;
      if(i % 10 === 0){
        setProgress(i/frames);
        updateExport();
        vctx.drawImage(comp, 0, 0, vCanvas.width, vCanvas.height);   // let the preview show the render
      }
    }
    if(job.cancelled){
      await output.cancel();
      T.say('Export cancelled.', false);
    }else{
      setProgress(1);
      await output.finalize();
      var blob = new Blob([output.target.buffer], { type:'video/mp4' });
      T.saveFile('tonal-video-' + f.id + '.mp4', blob);
      var msg = 'Saved a ' + mmss(total) + ' video (' + Math.max(1, Math.round(blob.size/1e6)) + ' MB).';
      if(failed.length) T.say(msg + ' Couldn’t read: ' + failed.join(', ') + '.');
      else T.say(msg, false);
    }
  }catch(err){
    if(output){ try{ await output.cancel(); }catch(e){} }
    T.say('Video export failed: ' + ((err && err.message) || err));
  }finally{
    cache.forEach(function(e){ R.release(e.tex); });
    exporting = null;
    setProgress(null);
    lock(false);
    T.setBusy(false);
    updateExport();
    refresh();
  }
}

/* ============================== entry points ============================== */

var built = false;

function show(){
  var has = T.photos().length > 0;
  $('empty').classList.toggle('hidden', has);
  vCanvas.classList.toggle('hidden', !has);
  $('vBar').hidden = !has;
  $('vTrack').hidden = !has;
}

function enter(){
  active = true;
  if(!built){ buildPanel(); bindPlayer(); built = true; }
  sync();
  show();
  buildTrack();
  buildPick();
  buildClipSec();
  $('vLen').textContent = mmss(total);
  updateExport();
  updatePlay();
  loadPreviews();
  fontsReady().then(refresh);
  refresh();
}

function leave(){
  active = false;
  pause();
  $('vFocus').hidden = true;
  stage.classList.remove('picking');
}

function photosChanged(){
  if(!active) return;
  sync();
  show();
  changed(true);
  loadPreviews();
}

// Space plays and pauses; the arrow keys step through the photos.
function key(e){
  if(exporting || (e.target && e.target.tagName === 'BUTTON')) return;
  if(e.key === ' '){ e.preventDefault(); playing ? pause() : play(); }
  else if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
    if(!clips.length) return;
    e.preventDefault();
    var n = selected < 0 ? 0 : selected + (e.key === 'ArrowRight' ? 1 : -1);
    select(Math.min(clips.length - 1, Math.max(0, n)));
  }else if(e.key === 'Escape') select(-1);
}

window.TonalVideo = { enter:enter, leave:leave, refresh:refresh, key:key, photosChanged:photosChanged, updateExport:updateExport };

})();
