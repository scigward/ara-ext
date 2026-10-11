// mirai-ext, built file, edit src/ instead
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/cache.ts
function cache(ms, max2 = 64) {
  const map = /* @__PURE__ */ new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return void 0;
      if (hit.until < Date.now()) {
        map.delete(key);
        return void 0;
      }
      return hit.value;
    },
    set(key, value, life = ms) {
      map.delete(key);
      map.set(key, { value, until: Date.now() + life });
      if (map.size > max2) map.delete(map.keys().next().value);
      return value;
    }
  };
}

// src/clock.ts
var noClock = { left: () => Infinity, run: (work) => work };
function startClock(ms) {
  const end = Date.now() + ms;
  return {
    left: () => end - Date.now(),
    run(work) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("mirai took too long to answer")), Math.max(0, end - Date.now()));
        work.then(resolve, reject).finally(() => clearTimeout(timer));
      });
    }
  };
}

// src/subtitle.ts
var FORMATS = ["ass", "ssa", "srt", "vtt", "sub"];
var MIME = {
  ass: "text/x-ssa",
  ssa: "text/x-ssa",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  sub: "text/plain"
};
function formatOf(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return FORMATS.find((f) => f === ext);
}
function decodeText(bytes) {
  if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}
var TIMES = /(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}/;
function detectFormat(text) {
  if (/^\s*\[Script Info\]/im.test(text) || /^Dialogue:/m.test(text)) return "ass";
  if (/^\s*WEBVTT/.test(text) && TIMES.test(text)) return "vtt";
  if (TIMES.test(text)) return "srt";
  if (/^[{[]\d+[}\]][{[]\d+[}\]]/m.test(text)) return "sub";
}
function toDataUrl(text, format) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i2 = 0; i2 < bytes.length; i2 += 32768) binary += String.fromCharCode(...bytes.subarray(i2, i2 + 32768));
  return `data:${MIME[format]};charset=utf-8;base64,${btoa(binary)}`;
}

// src/names.ts
var MAX_SPAN = 4;
var YEAR = /^(?:19|20)\d\d$/;
var TAG = /^(?:v\d+|\d{3,4}[pi]|\d{3,4}x\d{3,4}|[\da-f]{8}|bd(?:rip)?|blu-?ray|web(?:[ -]?(?:dl|rip))?|tv(?:rip)?|dvd(?:rip)?|hdtv|raw|aac|ac3|flac|x26[45]|h\.?26[45]|hevc|avc|\d+-?bits?|dual[ -]?audio|multi|batch|complete|(?:ar|ara|arabic)(?:[ -]?subs?)?|subs?|ass|srt|vtt|ssa|(?:19|20)\d\d)$/i;
var SEASON_TAG = /^(?:S|P|Part\s*|Season\s*|Cour\s*)\d{1,2}\s*[-–]?\s*(?:E|EP)?\s*(\d{1,3})(?:\s+(?:END|FINAL|FIN))?$/i;
var EPISODE_TAG = /^(?:E(?:P)?\s*)?(\d{1,4})(?:v\d+)?$/i;
var PART_TAG = /^Part\s*(\d{1,2})$/i;
var CREDITS = /^(?:www\.)?mirai/i;
var asciiDigits = (text) => text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
function span(a, b) {
  const from = Number(a);
  const to = b === void 0 ? from : Number(b);
  return to >= from && to - from < MAX_SPAN ? [from, to] : void 0;
}
var OUTSIDE = [
  // s02e05, s02e05-e06
  /\bS\d{1,2}\s*E(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*E?(\d{1,4}))?(?![\d.])/i,
  // e05, ep05, episode 05, ep05-06
  /\bE(?:P|pisode)?\s*(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*E?(?:P|pisode)?\s*(\d{1,4}))?(?![\d.]|\s*p\b)/i,
  /(?:الحلقة|حلقة)\s*(\d{1,4})(?:\s*[-~&+]\s*(\d{1,4}))?/,
  /第\s*(\d{1,4})\s*話/
];
var DASH = /(?:^|\s)-\s*(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*(\d{1,4})(?:v\d+)?)?(?=\s|$)/g;
var HYPHEN = /(?:^|\D)-(\d{1,4})(?:v\d+)?(?=-|\s|$)/g;
var TRAILING = /(?:^|\s)(\d{1,4})(?:v\d+)?(?:\s*(?:[-~&+,]|and)\s*(\d{1,4})(?:v\d+)?)?\s*$/i;
var SPECIAL = /\b(?:SP|OVA|OAD|ONA|Special)s?\s*0*(\d{1,3})\b/i;
function episodesOf(outside, groups) {
  const text = outside.replaceAll("_", " ").replace(/\./g, (dot, at, whole) => /\d/.test(whole[at - 1] ?? "") && /^\d(?!\d)/.test(whole.slice(at + 1)) ? dot : " ");
  for (const pattern of OUTSIDE) {
    const m = pattern.exec(text);
    if (m) return { range: span(m[1], m[2]), strong: true };
  }
  const dashed = [...text.matchAll(DASH)].at(-1);
  if (dashed) return { range: span(dashed[1], dashed[2]), strong: true };
  const hyphen = [...text.matchAll(HYPHEN)].filter((m) => !YEAR.test(m[1])).at(-1);
  if (hyphen) return { range: span(hyphen[1]), strong: true };
  const special = SPECIAL.exec(text);
  if (special) return { range: span(special[1]), strong: true };
  const end = TRAILING.exec(text);
  if (end && !YEAR.test(end[1])) return { range: span(end[1], end[2]), strong: true };
  const start = /^\s*(\d{1,4})(?:v\d+)?(?=[\s-]|$)/.exec(text);
  if (start && !YEAR.test(start[1])) return { range: span(start[1]), strong: false };
  for (const group of groups) {
    const m = EPISODE_TAG.exec(group) ?? PART_TAG.exec(group);
    if (m && !YEAR.test(m[1])) return { range: span(m[1]), strong: true };
  }
  return { strong: false };
}
function seasonOf(groups) {
  for (const group of groups) {
    const m = SEASON_TAG.exec(group);
    if (m) return span(m[1]);
  }
}
function versionOf(text, groups) {
  const m = /\bv(\d)\b/i.exec(text) ?? /(?:^|\s|\d)v(\d)(?=\s|$)/i.exec(text);
  const tagged = groups.map((g) => /^v(\d)$/i.exec(g)).find(Boolean);
  return Number(tagged?.[1] ?? m?.[1] ?? 1);
}
var clean = (text) => text.replace(/\s+/g, " ").trim();
var marker = (g) => EPISODE_TAG.test(g) || SEASON_TAG.test(g) || PART_TAG.test(g);
function groupOf(groups) {
  return groups.map(clean).find((group) => group && group.length <= 60 && !TAG.test(group) && !marker(group));
}
var hidden = (path) => path.split("/").some((part) => part === "__MACOSX" || part.startsWith("."));
function describe(path) {
  if (path.length > 400 || hidden(path)) return void 0;
  const base = path.slice(path.lastIndexOf("/") + 1);
  const ext = base.slice(base.lastIndexOf(".") + 1).toLowerCase();
  const format = ext === "txt" || ext === "zip" ? ext : formatOf(base);
  if (!format) return void 0;
  const groups = [];
  const stem = asciiDigits(base.slice(0, base.lastIndexOf(".")));
  const outside = stem.replace(/[[(【]([^\])】]*)[\])】]/g, (_, inner) => {
    groups.push(inner.trim());
    return " ";
  });
  const { range: episodes, strong } = episodesOf(outside, groups);
  if ((format === "txt" || format === "zip") && (!episodes || CREDITS.test(base))) return void 0;
  const group = groupOf(groups);
  const noise = (g) => !g || g.length > 40 || clean(g) === group || /^v\d+$/i.test(g) || /^[\da-f]{8}$/i.test(g) || YEAR.test(g) || marker(g);
  return {
    path,
    format,
    episodes,
    strong,
    title: clean(outside.toLowerCase()),
    season: seasonOf(groups),
    group,
    tags: groups.filter((g) => !noise(g)),
    version: versionOf(outside, groups)
  };
}
var RANK = { ass: 0, ssa: 1, srt: 2, vtt: 3, sub: 4, txt: 5, zip: 6 };
var within = (range, n) => !!range && n >= range[0] && n <= range[1];
var shift = (range, by) => range && [range[0] - by, range[1] - by];
function gapOf(all) {
  const gaps = all.filter((d) => d.season && d.episodes).map((d) => d.episodes[0] - d.season[0]);
  if (gaps.length < 3) return void 0;
  const counts = /* @__PURE__ */ new Map();
  for (const gap2 of gaps) counts.set(gap2, (counts.get(gap2) ?? 0) + 1);
  const [gap, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return count / gaps.length >= 0.75 ? gap : void 0;
}
function pickFiles(paths, episodes, lone, span2) {
  const all = paths.map(describe).filter((d) => !!d);
  const mixed = new Set(all.map((d) => d.group).filter(Boolean)).size > 1;
  const [episode, absolute] = episodes;
  const gap = gapOf(all);
  const main = (d) => d.episodes;
  const season = (d) => gap !== void 0 && d.episodes ? shift(d.episodes, gap) : d.season;
  const fit = (pick) => span2 ? all.filter((d) => {
    const range = pick(d);
    return !!range && range[0] >= span2[0] && range[1] <= span2[1];
  }).length : 0;
  let found = [];
  if (episode !== void 0) {
    for (const pick of fit(main) > fit(season) ? [main, season] : [season, main]) {
      found = all.filter((d) => within(pick(d), episode));
      if (found.length) break;
    }
  }
  if (!found.length && absolute !== void 0) found = all.filter((d) => within(d.episodes, absolute));
  if (!found.length && span2 && episode !== void 0 && episode >= span2[0] && episode <= span2[1]) {
    const numbers = [...new Set(all.flatMap((d) => d.episodes ? [d.episodes[0]] : []))].sort((a, b) => a - b);
    const elsewhere = all.every((d) => !d.episodes || d.episodes[1] < span2[0] || d.episodes[0] > span2[1]);
    if (elsewhere && numbers.length === span2[1] - span2[0] + 1) found = all.filter((d) => d.episodes?.[0] === numbers[episode - span2[0]]);
  }
  if (!found.length) {
    const numbers = new Set(all.flatMap((d) => d.episodes ? [d.episodes[0]] : []));
    if (lone) found = all.length === 1 || numbers.size <= 1 ? all : all.filter((d) => !d.strong);
    else if (all.length === 1 && !all[0].episodes) found = all;
  }
  const best = /* @__PURE__ */ new Map();
  for (const d of found) {
    const key = `${d.group ?? ""}|${d.episodes?.join("-") ?? ""}|${d.tags.join(" ")}|${d.title}`;
    const had = best.get(key);
    if (!had || d.version > had.version || d.version === had.version && RANK[d.format] < RANK[had.format]) best.set(key, d);
  }
  return [...best.values()].map((d) => ({ ...d, mixed }));
}

// node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift2 = dl - dt, dend = Math.min(dt, end);
          if (shift2 + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift2 + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// src/http.ts
var ORIGIN = "https://miraianime.net";
var HttpError = class extends Error {
  constructor(status, url) {
    super(`mirai answered ${status} for ${new URL(url).pathname}`);
    __publicField(this, "status");
    this.name = "HttpError";
    this.status = status;
  }
};
async function request(fetchFn, url, clock, headers) {
  const res = await clock.run(fetchFn(url, headers ? { headers } : void 0));
  if (res.ok) return res;
  const body = res.status === 403 || res.status === 503 ? await clock.run(res.text()).catch(() => "") : "";
  if (/just a moment|challenge-platform|cf-chl/i.test(body)) {
    throw new Error("mirai wants a cloudflare check, open the site once in a browser");
  }
  throw new HttpError(res.status, url);
}
async function getText(fetchFn, url, clock) {
  const res = await request(fetchFn, url, clock);
  return await clock.run(res.text());
}

// src/zip.ts
var SkippedEntry = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SkippedEntry";
  }
};
var TAIL = 64 * 1024;
var SLACK = 512;
var MAX_SIZE = 12 * 1024 * 1024;
var MAX_PACKED = 4 * 1024 * 1024;
var MAX_DIRECTORY = 4 * 1024 * 1024;
var TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 4294967295;
  for (const b of bytes) c = TABLE[(c ^ b) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
var u162 = (b, o) => b[o] | b[o + 1] << 8;
var u32 = (b, o) => (u162(b, o) | u162(b, o + 2) << 16) >>> 0;
function decodeName(raw) {
  let name;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    name = new TextDecoder("windows-1256").decode(raw);
  }
  return name.replaceAll("\\", "/");
}
function findEnd(buf) {
  const lowest = Math.max(0, buf.length - 22 - 65535);
  for (let i2 = buf.length - 22; i2 >= lowest; i2--) {
    if (u32(buf, i2) === 101010256 && i2 + 22 + u162(buf, i2 + 20) <= buf.length) return i2;
  }
  throw new Error("that file is not a zip");
}
function parseDirectory(dir, count) {
  const entries = [];
  let p = 0;
  for (let i2 = 0; i2 < count && p + 46 <= dir.length; i2++) {
    if (u32(dir, p) !== 33639248) break;
    const packed = u32(dir, p + 20);
    const size = u32(dir, p + 24);
    const offset = u32(dir, p + 42);
    if (packed === 4294967295 || size === 4294967295 || offset === 4294967295) throw new Error("zip64 files are not supported");
    const nameLength = u162(dir, p + 28);
    entries.push({
      name: decodeName(dir.subarray(p + 46, p + 46 + nameLength)),
      nameLength,
      method: u162(dir, p + 10),
      flags: u162(dir, p + 8),
      crc: u32(dir, p + 16),
      packed,
      size,
      offset
    });
    p += 46 + nameLength + u162(dir, p + 30) + u162(dir, p + 32);
  }
  return entries;
}
async function build(tail, whole, outside, clock) {
  const end = findEnd(tail);
  const count = u162(tail, end + 10);
  const dirSize = u32(tail, end + 12);
  const dirOffset = u32(tail, end + 16);
  if (count === 65535 || dirSize === 4294967295 || dirOffset === 4294967295) throw new Error("zip64 files are not supported");
  if (dirSize > MAX_DIRECTORY) throw new Error("that zip has a silly amount of files");
  const base = whole ? 0 : dirOffset + dirSize - end;
  const grab = (start, length, clock2) => start >= base ? Promise.resolve(tail.subarray(start - base, start - base + length)) : outside(start, length, clock2);
  const entries = parseDirectory(await grab(dirOffset, dirSize, clock), count);
  return {
    entries,
    async read(entry, clock2) {
      if (entry.flags & 1) throw new SkippedEntry(`${entry.name} is encrypted`);
      if (entry.size > MAX_SIZE || entry.packed > MAX_PACKED) throw new SkippedEntry(`${entry.name} is too big`);
      let buf = await grab(entry.offset, 30 + entry.nameLength + SLACK + entry.packed, clock2);
      if (buf.length < 30 || u32(buf, 0) !== 67324752) throw new Error(`${entry.name} has a broken header`);
      const dataStart = 30 + u162(buf, 26) + u162(buf, 28);
      if (buf.length < dataStart + entry.packed) buf = await grab(entry.offset, dataStart + entry.packed, clock2);
      if (buf.length < dataStart + entry.packed) throw new Error(`${entry.name} is cut short`);
      const packed = buf.subarray(dataStart, dataStart + entry.packed);
      let data;
      if (entry.method === 0) data = packed;
      else if (entry.method === 8) data = inflateSync(packed, { out: new Uint8Array(entry.size) });
      else throw new SkippedEntry(`${entry.name} uses a zip method we can't open`);
      if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(`${entry.name} is damaged`);
      return data;
    }
  };
}
async function openZip(fetchFn, url, clock, tailSize = TAIL) {
  const res = await request(fetchFn, url, clock, { Range: `bytes=-${tailSize}` });
  const tail = new Uint8Array(await clock.run(res.arrayBuffer()));
  return await build(tail, res.status !== 206, async (start, length, clock2) => {
    const got = await request(fetchFn, url, clock2, { Range: `bytes=${start}-${start + length - 1}` });
    const body = new Uint8Array(await clock2.run(got.arrayBuffer()));
    return got.status === 206 ? body : body.subarray(start, start + length);
  }, clock);
}
function zipFromBytes(bytes) {
  return build(bytes, true, () => Promise.reject(new Error("that zip is cut short")), noClock);
}

// src/files.ts
var entryOf = (zip, path) => zip.entries.find((e) => e.name === path);
function fromBytes(bytes, file) {
  const text = decodeText(bytes);
  const format = detectFormat(text);
  return format ? [{ file, url: toDataUrl(text, format), format }] : [];
}
async function readPicked(zip, file, clock) {
  const bytes = await zip.read(entryOf(zip, file.path), clock);
  if (file.format !== "zip") return fromBytes(bytes, file);
  const inner = await zipFromBytes(bytes);
  const picks = pickFiles(inner.entries.map((e) => e.name), [file.episodes?.[0]], true).filter((p) => p.format !== "zip");
  const reads = await Promise.all(picks.map(async (p) => fromBytes(await inner.read(entryOf(inner, p.path), noClock), file)));
  return reads.flat();
}

// src/gather.ts
function gather(tasks, grace) {
  return new Promise((resolve) => {
    const values = [];
    const errors = [];
    let open = tasks.length;
    let timer;
    const done = () => {
      clearTimeout(timer);
      resolve({ values: values.flat(), errors });
    };
    if (!open) done();
    tasks.forEach((task, i2) => {
      task.then((found) => {
        values[i2] = found;
        if (found.length) timer ?? (timer = setTimeout(done, grace));
      }, (error) => {
        errors.push(error);
      }).finally(() => {
        if (!--open) done();
      });
    });
  });
}

// src/label.ts
function label(file, block, format, extra = "") {
  const credited = block.translators.join(" & ");
  const who = (file.mixed ? file.group ?? credited : credited || file.group) || "Mirai";
  const release = block.release ? ` (${block.release})` : "";
  const name = `Arabic - ${who.slice(0, 50)}${release}${extra ? ` ${extra}` : ""}`.replace(/[\\/:*?"<>|\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();
  return `${name}.${format}`;
}
function unique(names) {
  const seen = /* @__PURE__ */ new Map();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    const dot = name.lastIndexOf(".");
    return n === 1 ? name : `${name.slice(0, dot)} ${n}${name.slice(dot)}`;
  });
}

// src/listing.ts
var NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(text) {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (all, dec, hex, name) => {
    if (name) return NAMED[name.toLowerCase()] ?? all;
    const code = Number.parseInt(dec ?? hex, dec ? 10 : 16);
    return code > 0 && code <= 1114111 ? String.fromCodePoint(code) : all;
  });
}
var plain = (html) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
var asciiDigits2 = (text) => text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
var UNITS = { \u0643\u064A\u0644\u0648: 1024, \u0645\u064A\u062C\u0627: 1024 ** 2, \u062C\u064A\u062C\u0627: 1024 ** 3 };
function parseSize(text) {
  const m = /^([\d.]+)\s*(كيلو|ميجا|جيجا)?\s*بايت$/.exec(asciiDigits2(text).replace(/\s+/g, " ").trim());
  return m && Number.isFinite(Number(m[1])) ? Math.round(Number(m[1]) * (UNITS[m[2] ?? ""] ?? 1)) : void 0;
}
function parseEpisodes(cell) {
  const badges = [...cell.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => asciiDigits2(m[1]).trim());
  if (!badges.length || !badges.every((b) => /^\d{1,5}$/.test(b))) return [];
  const numbers = badges.map(Number);
  if (cell.includes("\u0625\u0644\u0649") && numbers.length === 2) return [[Math.min(...numbers), Math.max(...numbers)]];
  return numbers.map((n) => [n, n]);
}
function zipLink(hrefs) {
  for (const href of hrefs) {
    try {
      const url = new URL(decodeEntities(href), ORIGIN);
      if (!/^(www\.)?miraianime\.net$/.test(url.hostname)) continue;
      if (!url.pathname.startsWith("/wp-content/uploads/") || !/\.zip$/i.test(url.pathname)) continue;
      return `${ORIGIN}${url.pathname}${url.search}`;
    } catch {
    }
  }
}
var BLOCK = /<div class="entry fansub-details">([\s\S]*?)<\/table>\s*<\/div>\s*<div class="links-file">([\s\S]*?)<\/div>/g;
var ROW = /<tr>\s*<th>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
function parseListing(html) {
  const blocks = [];
  for (const [, info, links] of html.matchAll(BLOCK)) {
    const block = { episodes: [], release: "", translators: [], zip: "" };
    let missing = false;
    let size;
    for (const [, th, td2] of info.matchAll(ROW)) {
      const label2 = plain(th);
      if (label2.includes("\u0627\u0644\u062D\u0644\u0642\u0627\u062A")) block.episodes = parseEpisodes(td2);
      else if (label2.includes("\u0635\u062F\u0627\u0631")) block.release = [...td2.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => plain(m[1])).filter(Boolean).join("/");
      else if (label2.includes("\u0627\u0644\u0645\u062A\u0631\u062C\u0645")) block.translators = [...td2.matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => plain(m[1])).filter(Boolean);
      else if (label2.includes("\u062D\u062C\u0645")) {
        missing = plain(td2).includes("\u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
        size = parseSize(plain(td2));
      }
    }
    const zip = zipLink([...links.matchAll(/href="([^"]*)"/g)].map((m) => m[1]));
    if (zip && !missing) blocks.push({ ...block, zip, size });
  }
  return blocks;
}
function covers(block, episode) {
  return block.episodes.some(([from, to]) => episode >= from && episode <= to);
}

// src/plan.ts
function maxFiles(options) {
  return Math.min(8, Math.max(1, Math.round(Number(options.maxFiles) || 3)));
}
function plan(blocks, query, options) {
  const absolute = query.absoluteEpisodeNumber;
  const episodes = [query.episode, typeof absolute === "number" && absolute >= 0 && absolute !== query.episode ? absolute : void 0];
  const lone = (block) => block.episodes.length === 1 && block.episodes[0][0] === block.episodes[0][1];
  let steps = [];
  for (const episode of episodes) {
    if (episode === void 0) continue;
    steps = blocks.filter((block) => covers(block, episode)).map((block) => ({ block, episodes, lone: lone(block), span: block.episodes.length === 1 ? block.episodes[0] : void 0 }));
    if (steps.length) break;
  }
  if (!steps.length && (query.episodeCount === 1 || query.media?.format === "MOVIE")) {
    steps = blocks.filter((block) => !block.episodes.length).map((block) => ({ block, episodes, lone: true }));
  }
  const prefer = String(options.translators ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const rank = ({ block }) => {
    const at = prefer.findIndex((name) => block.translators.some((t) => t.toLowerCase().includes(name)));
    return at < 0 ? prefer.length : at;
  };
  return steps.sort((a, b) => rank(a) - rank(b)).slice(0, maxFiles(options) + 2);
}

// src/resolve.ts
var DAY = 24 * 60 * 60 * 1e3;
var slugCache = () => cache(DAY, 256);
var LINK = /href="https:\/\/miraianime\.net\/anime\/([^"/]+)\/"/g;
var idOf = (value) => Number(value) || void 0;
var squash = (title) => title.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
async function byMal(fetchFn, mal, clock) {
  const html = await getText(fetchFn, `${ORIGIN}/anime/?my_anime_list_ID=${mal}&submit=`, clock);
  return [...new Set([...html.matchAll(LINK)].map((m) => m[1]))];
}
async function rest(fetchFn, params, clock) {
  const data = JSON.parse(await getText(fetchFn, `${ORIGIN}/wp-json/wp/v2/anime?${params}&_fields=slug,title,acf.external_links`, clock));
  return Array.isArray(data) ? data : [];
}
var search = (fetchFn, term, clock) => rest(fetchFn, `search=${encodeURIComponent(term)}&per_page=10`, clock);
function searchTerms(titles) {
  const seen = /* @__PURE__ */ new Set();
  const terms = [];
  for (const title of titles) {
    const key = squash(title);
    if (!key || seen.has(key) || /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(title)) continue;
    seen.add(key);
    terms.push(title);
  }
  return terms.slice(0, 4);
}
function byIds(candidates, query, mal, strict) {
  let best;
  for (const c of candidates) {
    const links = c.acf?.external_links;
    const anilist = idOf(links?.anilist_id) === query.anilistId;
    const myanimelist = mal !== void 0 && idOf(links?.my_anime_list_id) === mal;
    const anidb = !!query.anidbAid && idOf(links?.anidb_id) === query.anidbAid;
    const score = Number(anilist) + Number(myanimelist) + Number(anidb);
    if (!score || strict && mal !== void 0 && !myanimelist) continue;
    if (!best || score > best.score) best = { slug: c.slug, score };
  }
  return best?.slug;
}
function byTitle(candidates, query) {
  const wanted = new Set(query.titles.map(squash));
  const same = candidates.filter((c) => wanted.has(squash(decodeEntities(c.title?.rendered ?? ""))));
  return same.length === 1 ? same[0].slug : void 0;
}
function firstFound(lookups) {
  return new Promise((resolve, reject) => {
    let open = lookups.length;
    const failures = [];
    if (!open) resolve(void 0);
    lookups.forEach((lookup, i2) => {
      lookup.then((slug) => {
        if (slug !== void 0) resolve(slug);
      }, (error) => {
        failures[i2] = error ?? new Error("lookup failed");
      }).finally(() => {
        if (--open) return;
        const failure = failures.find(Boolean);
        if (!failure) resolve(void 0);
        else reject(failure instanceof Error ? failure : new Error(String(failure)));
      });
    });
  });
}
async function findSlug(query, clock, slugs) {
  const key = String(query.anilistId);
  const known = slugs.get(key);
  if (known !== void 0) return known ?? void 0;
  const { fetch: fetchFn } = query;
  const mal = idOf(query.malId) ?? idOf(query.media?.idMal);
  const terms = searchTerms(query.titles);
  const lookups = [];
  if (mal) {
    lookups.push(byMal(fetchFn, mal, clock).then(async (hits) => {
      if (hits.length < 2) return hits[0];
      const rows = await Promise.all(hits.map((slug) => rest(fetchFn, `slug=${encodeURIComponent(slug)}`, clock)));
      return byIds(rows.flat(), query, mal, false) ?? hits[0];
    }));
  }
  let first = [];
  if (terms[0]) {
    lookups.push(search(fetchFn, terms[0], clock).then((rows) => {
      first = rows;
      return byIds(rows, query, mal, true);
    }));
  }
  let found = await firstFound(lookups);
  found ?? (found = byIds(first, query, mal, false) ?? byTitle(first, query));
  for (const term of terms.slice(1)) {
    if (found) break;
    const rows = await search(fetchFn, term, clock);
    found = byIds(rows, query, mal, false) ?? byTitle(rows, query);
  }
  return slugs.set(key, found ?? null, found ? DAY : 10 * 60 * 1e3) ?? void 0;
}

// src/extension.ts
var MINUTE = 60 * 1e3;
var WHOLE = 300 * 1024;
var asError = (reason) => reason instanceof Error ? reason : new Error(String(reason));
var gone = (error) => error instanceof HttpError && (error.status === 404 || error.status === 410);
var urlSafe = (slug) => /%[\da-f]{2}/i.test(slug) ? slug : encodeURIComponent(slug);
function named(files, block) {
  const plain2 = files.map((f) => label(f.file, block, f.format));
  const names = files.map((f, i2) => {
    const alike = files.filter((_, j) => plain2[j] === plain2[i2]);
    if (alike.length < 2) return plain2[i2];
    return label(f.file, block, f.format, f.file.tags.filter((tag) => alike.some((other) => !other.file.tags.includes(tag))).join(" "));
  });
  return unique(names).map((language, i2) => ({ url: files[i2].url, language }));
}
function createExtension(budget = 8e3, grace = 1500) {
  const slugs = slugCache();
  const listings = cache(10 * MINUTE, 64);
  const zips = cache(30 * MINUTE, 12);
  const found = cache(30 * MINUTE, 16);
  async function listing(slug, fetchFn, clock) {
    const known = listings.get(slug);
    if (known) return known;
    try {
      return listings.set(slug, parseListing(await getText(fetchFn, `${ORIGIN}/subtitle/${urlSafe(slug)}/`, clock)));
    } catch (error) {
      if (gone(error)) return listings.set(slug, [], 5 * MINUTE);
      throw error;
    }
  }
  async function fromZip({ block, episodes, lone, span: span2 }, query, clock) {
    const key = `${block.zip}|${episodes.join(",")}`;
    const known = found.get(key);
    if (known) return known;
    const tail = block.size && block.size <= WHOLE ? Math.ceil(block.size * 1.1) + 1024 : void 0;
    const zip = zips.get(block.zip) ?? zips.set(block.zip, await openZip(query.fetch, block.zip, clock, tail));
    const picked = pickFiles(zip.entries.map((e) => e.name), episodes, lone, span2);
    const reads = await Promise.allSettled(picked.map((file) => readPicked(zip, file, clock)));
    const files = reads.flatMap((r) => r.status === "fulfilled" ? r.value : []);
    const failed = reads.find((r) => r.status === "rejected" && !(r.reason instanceof SkippedEntry));
    if (failed && !files.length) throw asError(failed.reason);
    const results = named(files, block);
    return failed ? results : found.set(key, results);
  }
  return {
    url: ORIGIN,
    async test() {
      const clock = startClock(4e3);
      const res = await request(fetch, `${ORIGIN}/wp-json/wp/v2/anime?per_page=1&_fields=id`, clock);
      if (!Array.isArray(await clock.run(res.json()))) throw new Error("mirai answered something unexpected");
      return true;
    },
    async single(query, options = {}) {
      const clock = startClock(budget);
      const slug = await findSlug(query, clock, slugs);
      if (!slug) return [];
      const steps = plan(await listing(slug, query.fetch, clock), query, options);
      const { values: results, errors } = await gather(steps.map((step) => fromZip(step, query, clock)), grace);
      if (!results.length) {
        const failure = errors.find((error) => !gone(error));
        if (failure) throw asError(failure);
      }
      const names = unique(results.map((r) => r.language));
      return results.slice(0, maxFiles(options)).map((r, i2) => ({ ...r, language: names[i2] }));
    }
  };
}

// src/index.ts
var index_default = createExtension();
export {
  index_default as default
};
