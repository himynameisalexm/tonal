/* Tonal video: photos on a timeline become a short MP4 (up to a minute) with
   slow camera moves, blends between photos, the current look and simple text.
   Loaded on demand by index.html, which provides window.Tonal. Everything runs
   in this browser. */
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
// The camera move for the whole video (the Animation tab). A photo can have
// its own instead (MOTIONS, in its settings); 'auto' there means the video's.
var CAMERA = [
  { id:'auto',  name:'Mixed',    note:'Push-ins, pans and rises, varied to suit each photo' },
  { id:'in',    name:'Push in',  note:'Moves slowly in towards each photo’s focus point' },
  { id:'out',   name:'Pull out', note:'Starts close, then slowly reveals the whole space' },
  { id:'pan',   name:'Pan',      note:'Glides sideways, like a camera on a track' },
  { id:'up',    name:'Rise',     note:'Lifts slowly upward' },
  { id:'diag',  name:'Drift',    note:'Eases in along a gentle diagonal' },
  { id:'still', name:'Still',    note:'Holds almost still' }
];
var MOTIONS = [['auto', 'Same as video'], ['in', 'Push in'], ['out', 'Pull out'], ['left', 'Pan left'],
               ['right', 'Pan right'], ['up', 'Rise'], ['down', 'Lower'], ['diag', 'Drift'], ['still', 'Still']];
var MOTION_BADGE = { in:'In', out:'Out', left:'←', right:'→', up:'↑', down:'↓', diag:'Drift', still:'Still' };

// How each photo turns into the next. len: seconds, when not the pace's own
// transition length (scaled by scale, capped at max); dip: through black or
// white, rather than both photos on screen at once.
var BLENDS = [
  { id:'dissolve', group:'Smooth', name:'Dissolve',      note:'A soft cross-fade' },
  { id:'bloom',    group:'Smooth', name:'Bloom',         note:'The next photo glows in through its highlights' },
  { id:'leak',     group:'Smooth', name:'Light leak',    note:'A warm wash of film light', scale:1.15 },
  { id:'blur',     group:'Smooth', name:'Soft focus',    note:'The photos melt together through a gentle blur' },
  { id:'wipe',     group:'Smooth', name:'Wipe',          note:'A soft edge sweeps across' },
  { id:'slide',    group:'Smooth', name:'Slide',         note:'The next photo glides in over the last', max:1 },
  { id:'dip',      group:'Smooth', name:'Fade to black', note:'Dips through black', dip:true },
  { id:'zoom',     group:'Lively', name:'Zoom',          note:'Rushes into one photo and out of the next', len:0.6 },
  { id:'whip',     group:'Lively', name:'Whip pan',      note:'A fast, blurred sweep sideways', len:0.45 },
  { id:'flash',    group:'Lively', name:'Flash',         note:'A quick flash of white', len:0.5, dip:true },
  { id:'cut',      group:'Lively', name:'Cut',           note:'Straight to the next photo', len:0 }
];
var FPS = 30, FADE_IN = 0.6, FADE_OUT = 1.0, MAX_LEN = 60, PREVIEW_EDGE = 1280, MAX_DUR = 8;

var settings = {
  format:'16x9', pace:'luxury', motion:'auto', transition:'dissolve', letterbox:false, depth:false,
  text:{ openTitle:'', openSub:'', closeTitle:'', closeSub:'', font:'serif', size:'m', pos:'centre', colour:'white' }
};
(function restore(s){
  if(!s) return;
  ['format', 'pace', 'motion', 'transition', 'letterbox', 'depth'].forEach(function(k){ if(k in s) settings[k] = s[k]; });
  if(s.text) Object.keys(settings.text).forEach(function(k){ if(k in s.text) settings.text[k] = s.text[k]; });
  [[FORMATS, 'format'], [PACES, 'pace'], [CAMERA, 'motion'], [BLENDS, 'transition']].forEach(function(o){
    if(!o[0].some(function(x){ return x.id === settings[o[1]]; })) settings[o[1]] = o[0][0].id;
  });
})(T.savedVideo());

function save(){ T.saveVideo(JSON.parse(JSON.stringify(settings))); }
function byId(list, id){ return list.filter(function(x){ return x.id === id; })[0] || list[0]; }
function format(){ return byId(FORMATS, settings.format); }
function pace(){ return byId(PACES, settings.pace); }
function blend(){ return byId(BLENDS, settings.transition); }
// How long a blend lasts, and how much neighbouring photos overlap.
function transLen(){ var b = blend(); return b.len != null ? b.len : Math.min(b.max || Infinity, pace().trans*(b.scale || 1)); }
function overlap(){ return blend().dip ? 0 : transLen(); }
function minDur(){ return Math.max(2, Math.round((overlap() + 0.6)*10)/10); }
// The shortest a video of n photos can be, with every photo at its minimum.
function shortest(n){ return n ? n*minDur() - (n - 1)*overlap() : 0; }
function maxPhotos(){ var ov = overlap(); return Math.floor((MAX_LEN - ov)/(minDur() - ov) + 1e-6); }

function clamp01(v){ return Math.min(1, Math.max(0, v)); }
function smooth(x){ x = clamp01(x); return x*x*(3 - 2*x); }
function lerp(a, b, t){ return a + (b - a)*t; }
// Camera moves keep some speed at their ends, so a dissolve never shows a frozen photo.
function ease(p){ return 0.75*p + 0.25*smooth(p); }
// Blends: speeding up, slowing down, and both.
function easeIn(x){ x = clamp01(x); return x*x*x; }
function easeOut(x){ x = 1 - clamp01(x); return 1 - x*x*x; }
function inOut(x){ x = clamp01(x); return x < 0.5 ? 4*x*x*x : 1 - 4*(1 - x)*(1 - x)*(1 - x); }
function mmss(t){ var s = Math.round(t); return Math.floor(s/60) + ':' + ('0' + s%60).slice(-2); }

/* ============================== timeline ============================== */

var clips = [];     // { item, dur, motion, focus:{x,y}, caption, iw, ih }
var seen = [];      // photos the timeline already knows about
var segs = [], total = 0, selected = -1;

function newClip(it){ return { item:it, dur:pace().dur, motion:'auto', focus:{ x:0.5, y:0.5 }, caption:'' }; }
function clipOf(it){ return clips.filter(function(c){ return c.item === it; })[0]; }

// A first timeline: every photo if they fit in a minute at this pace,
// otherwise an even spread across the set (a mix of outside, inside, aerial).
function defaultClips(){
  var photos = T.photos(), P = pace(), ov = overlap();
  var fit = Math.max(1, Math.floor((MAX_LEN - ov)/(P.dur - ov)));
  var pick = photos;
  if(photos.length > fit){
    pick = [];
    for(var i = 0; i < fit; i++) pick.push(photos[Math.round(i*(photos.length - 1)/Math.max(1, fit - 1))]);
  }
  clips = pick.map(newClip);
  seen = photos.slice();
}

// Keeps the timeline in step with the loaded photos: removed photos drop out,
// photos added since join the end, as many as fit in a minute. Says so if
// that meant shortening the photos or leaving some out.
function sync(){
  var photos = T.photos(), left = 0;
  clips = clips.filter(function(c){ return photos.indexOf(c.item) >= 0; });
  seen = seen.filter(function(it){ return photos.indexOf(it) >= 0; });
  previews = previews.filter(function(p){
    if(photos.indexOf(p.item) >= 0) return true;
    if(p.bm) p.bm.close();
    return false;
  });
  if(!clips.length) defaultClips();
  else photos.forEach(function(it){
    if(seen.indexOf(it) >= 0) return;
    seen.push(it);
    if(shortest(clips.length + 1) <= MAX_LEN + 1e-6) clips.push(newClip(it));
    else left++;
  });
  if(selected >= clips.length) selected = clips.length - 1;
  pruneDepth();
  var shortened = capLength();
  if(left) T.say('A video can be up to a minute, so ' + left + (left === 1 ? ' new photo wasn’t' : ' new photos weren’t') +
                 ' added. Swap photos in under Photos in the video.', false);
  else if(shortened) T.say('Kept to a minute: the photos are now a little shorter.', false);
}

// Videos are capped at a minute. When the timeline runs over, every photo
// shortens by the same share (none below its minimum). Returns true if it had
// to, false if it didn't, null if even the shortest timeline is over a minute.
function capLength(){
  layout();
  if(total <= MAX_LEN + 1e-6) return false;
  if(shortest(clips.length) > MAX_LEN + 1e-6) return null;
  var ov = overlap(), min = minDur(), sum = 0;
  clips.forEach(function(c){ sum += c.dur; });
  var k = (MAX_LEN + (clips.length - 1)*ov)/sum;
  clips.forEach(function(c){ c.dur = Math.max(min, Math.floor(c.dur*k*10 + 1e-6)/10); });
  layout();
  while(total > MAX_LEN + 1e-6){   // photos held at their minimum can leave it a touch over
    var longest = clips.reduce(function(a, c){ return c.dur > a.dur ? c : a; });
    longest.dur = Math.round((longest.dur - 0.1)*10)/10;
    layout();
  }
  return true;
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

// What's on screen at time t: the photos, each with how it's drawn for the
// blend it's in, and what's laid over them (fx): black for the fades in and out
// and dips, white for a flash, a glow, film light, a slide's shadow.
function stateAt(t){
  var b = blend(), len = transLen(), half = len/2, layers = [];
  var fx = { dark:0, white:0, glow:0, leak:0, leakAt:0, shade:0 };
  segs.forEach(function(s){
    if(t < s.start || t >= s.end) return;
    if(b.dip && len){
      if(s.index > 0 && t < s.start + half) dipTo(fx, b.id, 1 - (t - s.start)/half, false);
      if(s.index < segs.length - 1 && t > s.end - half) dipTo(fx, b.id, (t - (s.end - half))/half, true);
    }
    layers.push({ seg:s, p:clamp01((t - s.start)/s.clip.dur), alpha:1 });
  });
  if(layers.length > 1) mixLayers(b.id, clamp01((t - layers[1].seg.start)/len), layers[0], layers[1], fx);
  if(t < FADE_IN) fx.dark = Math.max(fx.dark, 1 - t/FADE_IN);
  if(t > total - FADE_OUT) fx.dark = Math.max(fx.dark, (t - (total - FADE_OUT))/FADE_OUT);
  fx.dark = clamp01(fx.dark);
  return { layers:layers, fx:fx };
}

// Through black, or a flash of white; k is 1 right at the change of photo.
// A flash builds fast at the end of one photo and fades out over the next.
function dipTo(fx, id, k, leaving){
  if(id === 'flash') fx.white = Math.max(fx.white, leaving ? k*k*k : k*k);
  else fx.dark = Math.max(fx.dark, k);
}

// Two photos on screen at once: A leaving, B arriving, q running 0 to 1 across
// the blend. Sets how each is drawn (alpha, shift, zoom, blur, mask) and fx.
// Moves go right to left, like the Pan camera move.
function mixLayers(id, q, A, B, fx){
  var a = easeIn(q/0.5), b = 1 - easeOut((q - 0.5)/0.5), v;
  if(id === 'dissolve') B.alpha = smooth(q);
  else if(id === 'bloom'){
    B.mask = [2, smooth(q), 0.6];
    fx.glow = 0.1*Math.sin(Math.PI*q);
  }else if(id === 'leak'){
    B.alpha = smooth(q);
    fx.leak = Math.pow(Math.sin(Math.PI*q), 1.3);
    fx.leakAt = q;
  }else if(id === 'blur'){
    A.blur = [3, 0.022*smooth(q/0.55)];
    B.blur = [3, 0.022*(1 - smooth((q - 0.45)/0.55))];
    B.alpha = smooth((q - 0.2)/0.6);
    fx.glow = 0.08*Math.sin(Math.PI*q);
  }else if(id === 'wipe'){
    B.mask = [1, inOut(q), 0.14];
  }else if(id === 'slide'){
    // B covers A from the right; A eases back and darkens under its shadow
    v = q < 0.5 ? 4*q*q : 4*(1 - q)*(1 - q);   // speed, 1 at the middle
    B.shift = [1 - inOut(q), 0]; B.edge = true;
    B.blur = [1, Math.min(0.12, 0.05*v/transLen())];
    A.shift = [-0.3*inOut(q), 0];
    A.blur = [1, Math.min(0.04, 0.015*v/transLen())];
    fx.shade = inOut(q);
  }else if(id === 'zoom'){
    A.zoom = 1 + 1.4*a; A.blur = [2, 0.35*a];
    B.zoom = 1 + 1.4*b; B.blur = [2, 0.35*b];
    B.alpha = smooth((q - 0.4)/0.2);
  }else if(id === 'whip'){
    A.shift = [-0.5*a, 0]; A.blur = [1, 0.4*a];
    B.shift = [0.5*b, 0];  B.blur = [1, 0.4*b];
    B.alpha = smooth((q - 0.42)/0.16);
  }
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
// A photo's own move, else the video's. Pan always heads right, so the whole
// video travels one way, like a camera on a track.
function motionOf(seg){
  var m = seg.clip.motion === 'auto' ? settings.motion : seg.clip.motion;
  return m === 'auto' ? autoMotion(seg) : m === 'pan' ? 'right' : m;
}

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
  }else if(m === 'diag'){
    // ease in while drifting corner to corner, the other way on alternate photos
    var sx = seg.index % 2 ? -1 : 1;
    a = { cx:fx - sx*P.pan*0.3, cy:fy - P.pan*0.2, zoom:1 + P.zoom*0.3 };
    b = { cx:fx + sx*P.pan*0.3, cy:fy + P.pan*0.2, zoom:1 + P.zoom*1.1 };
  }else{
    // pans: zoom in a little for room, then travel across what's there
    var z = 1 + P.zoom*0.8, across = m === 'left' || m === 'right';
    var probe = T.frameFor({ cx:0.5, cy:0.5, zoom:z }, iw, ih, cp);
    var size = across ? probe[2] : probe[3];
    var travel = Math.min(1 - size, P.pan*(across && f.h > f.w ? 2 : 1));
    var mid = Math.min(Math.max(across ? fx : fy, size/2 + travel/2), 1 - size/2 - travel/2);
    var from = mid + travel/2, to = mid - travel/2;   // left and up head towards 0
    if(m === 'right' || m === 'down'){ var swap = from; from = to; to = swap; }
    a = across ? { cx:from, cy:fy, zoom:z } : { cx:fx, cy:from, zoom:z };
    b = across ? { cx:to, cy:fy, zoom:z } : { cx:fx, cy:to, zoom:z };
  }
  return T.frameFor({ cx:lerp(a.cx, b.cx, e), cy:lerp(a.cy, b.cy, e), zoom:lerp(a.zoom, b.zoom, e) }, iw, ih, cp);
}

/* ============================== 3D depth ============================== */

// With 3D depth on, an AI model (Depth Anything V2, run in this browser by
// Transformers.js) works out how near each part of a photo is. The shader then
// moves the camera through it: near things glide past far ones. The model
// downloads once, on first use; photos never leave the browser.
var DEPTH_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
var DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
var depths = new Map();   // photo -> { map, mid } once ready, { busy } or { failed } before
var depthModel = null, depthJob = null;

function depthOf(c){
  if(!settings.depth) return null;
  var d = depths.get(c.item);
  return d && d.map ? d : null;
}

// How the camera moves through a photo at eased progress e, as [x, y, grow,
// mid]: near things shift by x, y and grow by grow more than things at depth
// mid. It follows the photo's camera move, so pans and rises gain parallax and
// push-ins become dolly moves.
function depthCam(seg, e, mid){
  var m = motionOf(seg), s = e - 0.5, A = 0.07, x = 0, y = 0, grow = 0;
  if(m === 'in') grow = 0.1*e;
  else if(m === 'out') grow = 0.1*(1 - e);
  else if(m === 'left') x = A*s;
  else if(m === 'right') x = -A*s;
  else if(m === 'up') y = A*s;
  else if(m === 'down') y = -A*s;
  else if(m === 'diag'){ var sx = seg.index % 2 ? -1 : 1; x = -sx*A*0.7*s; y = -A*0.5*s; grow = 0.06*e; }
  else x = 0.04*s;   // still: the faintest sway
  return [x, y, grow, mid];
}

function loadDepthModel(){
  if(!depthModel){
    depthModel = import(DEPTH_LIB).then(function(TF){
      var gpu = navigator.gpu ? navigator.gpu.requestAdapter().catch(function(){ return null; }) : Promise.resolve(null);
      return gpu.then(function(adapter){
        var opts = adapter ? { device:'webgpu', dtype:'fp16' } : { device:'wasm', dtype:'q8' };
        opts.session_options = { logSeverityLevel:3 };   // errors only, not routine notices
        return TF.pipeline('depth-estimation', DEPTH_MODEL, opts);
      }).then(function(pipe){ return { TF:TF, pipe:pipe }; });
    });
    depthModel.catch(function(){ depthModel = null; });
  }
  return depthModel;
}

// Works through the timeline's photos one at a time, so the first ones get
// depth (and the preview moves in 3D) while the rest are still being done.
// Resolves once every photo on the timeline has been done.
function runDepth(){
  if(!settings.depth) return Promise.resolve();
  if(!depthJob) depthJob = depthStep().then(function(){ depthJob = null; });
  return depthJob;
}
function depthStep(){
  var next = settings.depth && clips.map(function(c){ return c.item; }).filter(function(it){ return !depths.has(it); })[0];
  depthStatus();
  if(!next) return Promise.resolve();
  depths.set(next, { busy:true });
  return loadDepthModel().then(function(M){
    return T.decode(next.file, 640).then(function(bm){
      var c = document.createElement('canvas');
      c.width = bm.width; c.height = bm.height;
      c.getContext('2d').drawImage(bm, 0, 0);
      bm.close();
      return M.TF.RawImage.fromCanvas(c);
    }).then(function(img){ return M.pipe(img); }).then(function(out){
      if(T.photos().indexOf(next) < 0){ depths.delete(next); return; }
      var dm = smoothDepth(out.depth.data, out.depth.width, out.depth.height);
      depths.set(next, { map:R.depthMap(dm.data, out.depth.width, out.depth.height), mid:dm.mid });
    }).catch(function(){ depths.set(next, { failed:true }); });
  }).then(function(){
    refresh();
    return depthStep();
  }, function(){
    // the model itself didn't load: turn 3D off and say why
    depths.delete(next);
    settings.depth = false;
    save();
    var cb = $('vDepth'); if(cb) cb.checked = false;
    depthStatus();
    T.say('3D depth couldn’t load. It needs an internet connection the first time; check yours and try again.');
  });
}

// Spreads the model's depth over the full range (ignoring the extreme 2%), then
// widens near things a little and softens edges, so moving around them tears less.
function smoothDepth(src, w, h){
  var n = w*h, hist = new Uint32Array(256), i, acc = 0, lo = -1, mid = -1, hi = 255;
  for(i = 0; i < n; i++) hist[src[i]]++;
  for(i = 0; i < 256; i++){
    acc += hist[i];
    if(lo < 0 && acc > n*0.02) lo = i;
    if(mid < 0 && acc >= n*0.5) mid = i;
    if(acc >= n*0.98){ hi = i; break; }
  }
  hi = Math.max(hi, lo + 1);
  var a = new Float32Array(n), b = new Float32Array(n);
  for(i = 0; i < n; i++) a[i] = clamp01((src[i] - lo)/(hi - lo));
  // one direction of a filter over radius r: the largest value, or the average
  function pass(from, to, r, largest, across){
    for(var y = 0; y < h; y++) for(var x = 0; x < w; x++){
      var v = 0;
      for(var k = -r; k <= r; k++){
        var s = across ? from[y*w + Math.min(w - 1, Math.max(0, x + k))] : from[Math.min(h - 1, Math.max(0, y + k))*w + x];
        v = largest ? Math.max(v, s) : v + s;
      }
      to[y*w + x] = largest ? v : v/(2*r + 1);
    }
  }
  pass(a, b, 3, true, true); pass(b, a, 3, true, false);
  for(var p = 0; p < 2; p++){ pass(a, b, 4, false, true); pass(b, a, 4, false, false); }
  var out = new Uint8Array(n);
  for(i = 0; i < n; i++) out[i] = Math.round(a[i]*255);
  return { data:out, mid:clamp01((mid - lo)/(hi - lo)) };
}

function depthStatus(){
  var note = $('vDepthNote');
  if(!note) return;
  if(!settings.depth){ note.textContent = ''; return; }
  var done = clips.filter(function(c){ var d = depths.get(c.item); return d && (d.map || d.failed); }).length;
  var failed = clips.filter(function(c){ var d = depths.get(c.item); return d && d.failed; }).length;
  note.textContent = done < clips.length
    ? (depthModel ? 'Adding depth: ' + done + ' of ' + clips.length + ' photos…' : 'Loading the depth model…')
    : failed ? 'Depth added, except for ' + failed + (failed === 1 ? ' photo' : ' photos') + ' it couldn’t read.' : 'Depth added to ' + (clips.length === 1 ? 'the photo.' : clips.length === 2 ? 'both photos.' : 'all ' + clips.length + ' photos.');
}

// Drops depth maps of photos no longer loaded.
function pruneDepth(){
  var photos = T.photos();
  depths.forEach(function(d, it){
    if(photos.indexOf(it) >= 0) return;
    if(d.map) R.release(d.map);
    depths.delete(it);
  });
}

/* ============================== drawing ============================== */

var stage = $('stage'), vCanvas = $('vCanvas'), vctx = vCanvas.getContext('2d');
var glc = document.createElement('canvas');
var R = T.createRenderer(glc);
R.init();
glc.addEventListener('webglcontextlost', function(e){ e.preventDefault(); });
glc.addEventListener('webglcontextrestored', function(){ R.init(); textures = []; depths.clear(); runDepth(); refresh(); });

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
  var st = stateAt(t), fx = st.fx, drawn = 0;
  st.layers.forEach(function(L){
    var tex = texFor(L.seg.clip);
    if(!tex) return;
    var e = ease(L.p), view = viewAt(L.seg, e, tex.w, tex.h);
    var dp = depthOf(L.seg.clip);
    if(dp) view = zoomView(view, 1.08);   // room for far things to shrink into
    if(L.zoom) view = zoomView(view, L.zoom);
    if(L.seg.index === selected) shownView = view;
    var first = !drawn;   // the first photo drawn always fills the frame
    R.draw(W, H, tex, 1, grade, { region:view, frame:view, aspect:tex.w/tex.h, seed:seed,
      alpha:first ? 1 : L.alpha, mask:first ? null : L.mask, edge:!first && L.edge,
      shift:L.shift, blur:blurFor(L.blur, W, H), depth:dp && { map:dp.map, cam:depthCam(L.seg, e, dp.mid) } });
    drawn++;
  });
  if(drawn) ctx.drawImage(glc, 0, 0, W, H);
  else{ ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  var bar = barHeight(W, H);
  if(fx.shade) paintShade(ctx, W, H, fx.shade);
  if(fx.leak) paintLeak(ctx, W, H, fx.leak, fx.leakAt);
  if(fx.glow) wash(ctx, 0, W, H, 'rgba(255,255,255,' + fx.glow.toFixed(3) + ')', 'screen');
  if(bar){ ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); }
  drawText(ctx, W, H, t);
  if(fx.white > 0) wash(ctx, bar, W, H - 2*bar, 'rgba(255,255,255,' + fx.white.toFixed(3) + ')');
  if(fx.dark > 0){ ctx.fillStyle = 'rgba(0,0,0,' + fx.dark + ')'; ctx.fillRect(0, 0, W, H); }
}

// A view zoomed in by z about its centre.
function zoomView(v, z){
  var w = v[2]/z, h = v[3]/z;
  return [v[0] + (v[2] - w)/2, v[1] + (v[3] - h)/2, w, h];
}

// A blend's blur for the shader, [kind, amount, mip bias]: the bias softens
// each of the 16 taps by about the gap between them, so streaks stay smooth.
function blurFor(b, W, H){
  if(!b || !b[1]) return null;
  var reach = b[0] === 1 ? b[1]*W : b[0] === 2 ? b[1]*Math.hypot(W, H)/4 : b[1]*H;
  var gap = b[0] === 3 ? reach*0.44 : reach/16;
  return [b[0], b[1], Math.log2(Math.max(1, gap))];
}

function wash(ctx, y, W, h, colour, mode){
  ctx.save();
  if(mode) ctx.globalCompositeOperation = mode;
  ctx.fillStyle = colour;
  ctx.fillRect(0, y, W, h);
  ctx.restore();
}

// A slide's shadow: the photo underneath dims, darkest along the incoming edge.
function paintShade(ctx, W, H, e){
  var x = (1 - e)*W, w = W*0.06;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + (0.28*e).toFixed(3) + ')';
  ctx.fillRect(0, 0, x, H);
  var g = ctx.createLinearGradient(x - w, 0, x, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + (0.3*Math.min(1, e*5)*(1 - e)).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(x - w, 0, w, H);
  ctx.restore();
}

// Film light: a hot amber glow running along the top of the frame with a
// redder one trailing lower down, screened over the picture and sweeping left
// to right as the photos blend. k is how strong, at how far through.
var LEAKS = [
  { x:-0.3, y:0.18, r:0.62, stops:[[0, '255,228,178', 0.9], [0.22, '255,158,72', 0.62], [0.55, '222,72,42', 0.24], [1, '150,24,30', 0]] },
  { x:-0.75, y:0.78, r:0.5, stops:[[0, '255,118,74', 0.5], [0.5, '212,52,52', 0.16], [1, '140,20,40', 0]] }
];
function paintLeak(ctx, W, H, k, at){
  var big = Math.max(W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  LEAKS.forEach(function(L){
    var x = (L.x + 1.6*at)*W, y = L.y*H;
    var g = ctx.createRadialGradient(x, y, 0, x, y, L.r*big);
    L.stops.forEach(function(s){ g.addColorStop(s[0], 'rgba(' + s[1] + ',' + (s[2]*k).toFixed(3) + ')'); });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  ctx.restore();
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
var stopAt = null;   // a preview of a blend or camera move plays to here, then pauses

function previewSize(){
  var f = format(), s = Math.min(1, PREVIEW_EDGE/Math.max(f.w, f.h));
  return [Math.round(f.w*s), Math.round(f.h*s)];
}

function refresh(){
  if(active && tilesShown()) queueTiles();
  if(!active || drawQueued || playing) return;
  drawQueued = true;
  requestAnimationFrame(function(){ drawQueued = false; drawPreview(); });
}

// Paused at 0:00 the stage shows the opening once it has faded in (and its text has
// risen into place) instead of the black first frame.
function posterTime(){
  var tx = settings.text, open = (tx.openTitle || tx.openSub) && textTimes()[0];
  return open ? open.from + 0.9 : FADE_IN;
}

function drawPreview(){
  if(!active || exporting) return;
  var sz = previewSize();
  if(vCanvas.width !== sz[0]) vCanvas.width = sz[0];
  if(vCanvas.height !== sz[1]) vCanvas.height = sz[1];
  shownView = null;
  var t = playing || pos > 0 ? pos : posterTime();
  paintFrame(vctx, sz[0], sz[1], t, Math.floor(t*FPS), previewTex, T.grade());
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

function play(until){
  if(!clips.length || exporting) return;
  stopAt = until == null ? null : until;
  if(stopAt == null && pos >= total - 0.05) pos = 0;
  var wasPlaying = playing;
  playing = true;
  clock = performance.now(); clockPos = pos;
  updatePlay();
  if(!wasPlaying) requestAnimationFrame(tick);
}
function pause(){ playing = false; stopAt = null; updatePlay(); refresh(); }
function tick(now){
  if(!playing || !active) return;
  pos = clockPos + (now - clock)/1000;
  if(stopAt != null && pos >= stopAt){ pos = stopAt; playing = false; stopAt = null; updatePlay(); }
  else if(pos >= total){ pos = total; playing = false; updatePlay(); }
  drawPreview();
  if(playing) requestAnimationFrame(tick);
}
// Plays from one time to another, then pauses there.
function playRange(from, to){
  if(!clips.length || exporting) return;
  pos = Math.min(Math.max(from, 0), total);
  play(Math.min(Math.max(to, pos), total));
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
  $('tabAnimate').addEventListener('click', function(){ tilesQueued = false; updateTiles(); });
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
  $('vLen').textContent = lenText();
  updateExport();
  save();
  refresh();
  runDepth();   // photos new to the timeline
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
  if(c){ removeClip(clips.indexOf(c)); return; }
  if(shortest(clips.length + 1) > MAX_LEN + 1e-6){
    T.say('A video can be up to a minute, which fits ' + maxPhotos() + ' photos with this pace and blend.', false);
    return;
  }
  clips.push(newClip(it));
  var capped = capLength();
  changed(!!capped);
  loadPreviews();
  if(capped) T.say('Kept to a minute: the photos are now a little shorter.', false);
}

// Spreads the photos evenly so the video lasts about this long.
function fitTo(seconds){
  if(exporting || !clips.length) return;
  var n = clips.length, ov = overlap();
  var want = (seconds + (n - 1)*ov)/n;
  var d = Math.round(Math.min(MAX_DUR, Math.max(minDur(), want))*10)/10;
  clips.forEach(function(c){ c.dur = d; });
  capLength();   // rounding up can tip a minute over
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
      if(exporting || onPick(o[0]) === false) return;   // false: the change was refused
      Array.prototype.forEach.call(g.children, function(n){ n.setAttribute('aria-pressed', n === b ? 'true' : 'false'); });
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
  var bars = el('label', 'vtoggle');
  bars.id = 'vBars';
  bars.hidden = settings.format !== '16x9';
  var cb = el('input');
  cb.type = 'checkbox';
  cb.checked = settings.letterbox;
  cb.addEventListener('change', function(){ settings.letterbox = cb.checked; save(); refresh(); });
  bars.appendChild(cb);
  bars.appendChild(document.createTextNode('Cinematic bars'));
  shape.appendChild(bars);
  p.appendChild(shape);

  var paceSec = section('Pace', 'vLen');
  paceSec.appendChild(choice(PACES.map(function(x){ return [x.id, x.name]; }), settings.pace, function(v){
    var old = settings.pace;
    return within(function(){
      settings.pace = v;
      clips.forEach(function(c){ c.dur = pace().dur; });
    }, function(){ settings.pace = old; }, byId(PACES, v).name);
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
  paceSec.appendChild(el('p', 'small anote', 'Videos can be up to a minute. Camera moves and blends are in the Animation tab.'));
  p.appendChild(paceSec);

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

  $('vLen').textContent = lenText();
  buildAnimPanel();
}

function lenText(){ return mmss(total) + ' of ' + mmss(MAX_LEN); }

// Applies a change of pace or blend, keeping the video within a minute: the
// photos shorten evenly if they must. If even that can't fit them all, the
// change is undone and this returns false.
function within(apply, undo, name){
  var durs = clips.map(function(c){ return c.dur; });
  apply();
  var capped = capLength();
  if(capped === null){
    var n = maxPhotos();
    undo();
    clips.forEach(function(c, i){ c.dur = durs[i]; });
    layout();
    T.say(name + ' fits up to ' + n + ' photos in a minute. Take some out under Photos in the video first.');
    return false;
  }
  changed(true);
  if(capped) T.say('Kept to a minute: the photos are now a little shorter.', false);
  return true;
}

/* ============================== animation tab ============================== */

// The camera move and the blend for the whole video, as tiles that preview
// themselves with small graded stills of the first two photos.
function buildAnimPanel(){
  var p = $('vAnimPanel');
  p.textContent = '';
  var cam = section('Camera move');
  cam.appendChild(tiles(CAMERA, 'm', settings.motion, function(v){
    settings.motion = v;
    save();
    buildTrack();
    buildClipSec();
    previewMove();
  }, 'To give one photo its own move, select it on the timeline.'));
  var deep = el('label', 'vtoggle');
  var dcb = el('input');
  dcb.type = 'checkbox'; dcb.id = 'vDepth';
  dcb.checked = settings.depth;
  dcb.addEventListener('change', function(){
    settings.depth = dcb.checked;
    save();
    depthStatus();
    if(settings.depth) runDepth().then(function(){ if(settings.depth && active) previewMove(); });
    refresh();
  });
  deep.appendChild(dcb);
  deep.appendChild(document.createTextNode('3D depth'));
  cam.appendChild(deep);
  cam.appendChild(el('p', 'small anote', 'AI works out what’s near and far in each photo, so near things glide past ' +
    'far ones as the camera moves. It runs on this computer; the first time it downloads about 70 MB.'));
  var dnote = el('p', 'small anote');
  dnote.id = 'vDepthNote';
  cam.appendChild(dnote);
  p.appendChild(cam);
  var bl = section('Blend between photos');
  bl.appendChild(tiles(BLENDS, 'b', settings.transition, function(v){
    var old = settings.transition;
    var ok = within(function(){
      settings.transition = v;
      clips.forEach(function(c){ c.dur = Math.max(c.dur, minDur()); });
    }, function(){ settings.transition = old; }, byId(BLENDS, v).name);
    if(ok) previewBlend();
    return ok;
  }));
  p.appendChild(bl);
  tileKey = '';
  updateTiles();
}

function tiles(list, kind, current, onPick, extra){
  var wrap = el('div'), grid = el('div', 'atiles'), note = el('p', 'small anote'), group = null;
  grid.setAttribute('role', 'group');
  var describe = function(x){
    note.textContent = x.name + ': ' + x.note.charAt(0).toLowerCase() + x.note.slice(1) + '.' + (extra ? ' ' + extra : '');
  };
  list.forEach(function(x){
    if(x.group && x.group !== group){ group = x.group; grid.appendChild(el('h4', 'agroup', group)); }
    var b = el('button', 'atile ' + kind + '-' + x.id);
    b.type = 'button';
    b.title = x.note;
    b.setAttribute('aria-pressed', x.id === current ? 'true' : 'false');
    var pv = el('span', 'apv');
    pv.appendChild(tileImg('a'));
    if(kind === 'b'){ pv.appendChild(tileImg('b')); pv.appendChild(el('i', 'fx')); }
    b.appendChild(pv);
    b.appendChild(el('span', 'nm', x.name));
    b.addEventListener('click', function(){
      if(exporting || onPick(x.id) === false) return;
      Array.prototype.forEach.call(grid.querySelectorAll('.atile'), function(n){ n.setAttribute('aria-pressed', n === b ? 'true' : 'false'); });
      describe(x);
    });
    grid.appendChild(b);
    if(x.id === current) describe(x);
  });
  wrap.appendChild(grid);
  wrap.appendChild(note);
  return wrap;
}

function tileImg(cls){ var i = el('img', cls); i.alt = ''; return i; }

var tileUrls = [null, null], tileKey = '', tileTimer = 0, tilesQueued = false;
var ids = new WeakMap(), nextId = 1;
function idOf(it){ if(!ids.has(it)) ids.set(it, nextId++); return ids.get(it); }

function tilesShown(){ var p = $('paneAnimate'); return !!p && !p.hidden; }

// Grade changes arrive on every slider tick, so redraw the stills once they settle.
function queueTiles(){
  if(tilesQueued) return;
  tilesQueued = true;
  clearTimeout(tileTimer);
  tileTimer = setTimeout(function(){ tilesQueued = false; updateTiles(); }, 250);
}

function updateTiles(){
  if(!active || exporting || !tilesShown()) return;
  var cs = clips.slice(0, 2), grade = T.grade();
  if(cs.length === 1) cs.push(cs[0]);
  var key = cs.map(function(c){ var p = previewOf(c.item); return idOf(c.item) + (p && p.bm ? 'b' : c.item.thumb ? 't' : '-'); }).join('|') +
            JSON.stringify(grade);
  if(key === tileKey) return;
  tileKey = key;
  tileUrls = cs.map(function(c){ return still(c, grade); });
  Array.prototype.forEach.call($('vAnimPanel').querySelectorAll('.apv'), function(pv){
    var a = pv.querySelector('.a'), b = pv.querySelector('.b');
    if(tileUrls[0]) a.src = tileUrls[0]; else a.removeAttribute('src');
    if(b){ if(tileUrls[1]) b.src = tileUrls[1]; else b.removeAttribute('src'); }
  });
}

// A small 4:3 still of a photo with the current look, or its plain thumbnail
// until the preview has loaded.
function still(c, grade){
  var p = previewOf(c.item);
  if(!p || !p.bm) return c.item.thumb || null;
  var tex = previewTex(c), W = 320, H = 240;
  var view = T.frameFor({ cx:0.5, cy:0.5, zoom:1 }, tex.w, tex.h, { w:W, h:H });
  R.draw(W, H, tex, 1, grade, { region:view, frame:view, aspect:tex.w/tex.h });
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d').drawImage(glc, 0, 0);
  return cv.toDataURL('image/jpeg', 0.85);
}

// After picking a blend, play the nearest change of photo so you can see it.
function previewBlend(){
  if(segs.length < 2){ refresh(); return; }
  var len = transLen(), dip = blend().dip, best = null;
  segs.slice(1).forEach(function(s){
    var from = dip ? s.start - len/2 : s.start, to = dip ? s.start + len/2 : s.start + len;
    var d = Math.abs((from + to)/2 - pos);
    if(!best || d < best.d) best = { from:from, to:to, d:d };
  });
  playRange(best.from - 0.8, best.to + 0.8);
}

// After picking a camera move, play some of a photo that uses it.
function previewMove(){
  var here = segs.filter(function(s){ return s.start <= pos && pos < s.end; })[0] || segs[0];
  if(!here){ refresh(); return; }
  var s = here.clip.motion === 'auto' ? here : segs.filter(function(x){ return x.clip.motion === 'auto'; })[0] || here;
  var from = Math.max(FADE_IN, s.start + (s.index ? overlap() : 0));
  playRange(from, Math.min(s.end, from + 3));
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
  // as long as the rest of the video leaves room for, within a minute
  var room = Math.min(MAX_DUR, Math.floor((c.dur + MAX_LEN - total)*10 + 1e-6)/10);
  dur.type = 'range'; dur.id = 'vDur';
  dur.min = minDur(); dur.max = Math.max(minDur(), room); dur.step = 0.1; dur.value = c.dur;
  dur.addEventListener('input', function(){
    if(exporting) return;
    c.dur = parseFloat(dur.value);
    val.textContent = c.dur.toFixed(1) + ' s';
    layout();
    var badge = $('vClips').children[selected].querySelector('.dur');
    if(badge) badge.textContent = c.dur.toFixed(1) + 's';
    $('vCount').textContent = countText();
    $('vLen').textContent = lenText();
    updateExport();
    seek(segs[selected].start + c.dur/2);
  });
  row.appendChild(lab); row.appendChild(val); row.appendChild(dur);
  box.appendChild(row);
  T.paintRange(dur);
  if(room < MAX_DUR){
    var most = el('p', 'small', 'Up to ' + Math.max(minDur(), room).toFixed(1) + ' s here, to keep the video within a minute.');
    most.style.margin = '-4px 0 12px';
    box.appendChild(most);
  }

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
  ['vPanel', 'vAnimPanel', 'vClips'].forEach(function(id){
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
    await runDepth();   // every photo needs its depth map before rendering starts
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
  $('vLen').textContent = lenText();
  updateExport();
  updatePlay();
  loadPreviews();
  runDepth();
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
  runDepth();
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
