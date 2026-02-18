(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- math utils ----------
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const nearlyEqual = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b !== 0) { const t = a % b; a = b; b = t; }
    return a || 1;
  }

  // ---------- Rational ----------
  class Rational {
    constructor(n, d = 1) {
      n = Math.trunc(n); d = Math.trunc(d);
      if (!Number.isFinite(n) || !Number.isFinite(d)) throw new Error("Invalid number");
      if (d === 0) throw new Error("Divide by zero");
      if (d < 0) { n = -n; d = -d; }
      const g = gcd(n, d);
      this.n = n / g;
      this.d = d / g;
    }
    toNumber() { return this.n / this.d; }
    neg() { return new Rational(-this.n, this.d); }
    add(r) { return new Rational(this.n * r.d + r.n * this.d, this.d * r.d); }
    sub(r) { return new Rational(this.n * r.d - r.n * this.d, this.d * r.d); }
    mul(r) { return new Rational(this.n * r.n, this.d * r.d); }
    div(r) { if (r.n === 0) throw new Error("Divide by zero"); return new Rational(this.n * r.d, this.d * r.n); }
    isInt() { return this.d === 1; }
    powInt(k) {
      if (!Number.isInteger(k)) throw new Error("Exponent must be integer");
      if (k === 0) return new Rational(1, 1);
      const neg = k < 0; k = Math.abs(k);
      let nn = 1, dd = 1;
      for (let i = 0; i < k; i++) { nn *= this.n; dd *= this.d; }
      const r = new Rational(nn, dd);
      return neg ? new Rational(r.d, r.n) : r;
    }
  }

  function toMixedString(r) {
    const n = r.n, d = r.d;
    const sign = n < 0 ? -1 : 1;
    const an = Math.abs(n);
    const whole = Math.floor(an / d);
    const rem = an % d;
    if (rem === 0) return String(sign * whole);
    if (whole === 0) return `${sign < 0 ? "-" : ""}${rem}/${d}`;
    return `${sign < 0 ? "-" : ""}${whole} ${rem}/${d}`;
  }

  function formatDecimal(x, precision) {
    if (!Number.isFinite(x)) return String(x);
    const s = x.toFixed(precision);
    return s.replace(/(\.\d*?[1-9])0+$/,"$1").replace(/\.0$/,"");
  }

  // ---------- parsing fractions in input ----------
  function parseMixedFractionToken(token, settings) {
    const t = token.trim();
    const hyphen = settings.acceptHyphenMixed
      ? t.replace(/^(\-?\d+)\-(\d+\/\d+)$/, "$1 $2")
      : t;

    let m = hyphen.match(/^([+-]?\d+)\s+(\d+)\/(\d+)$/); // mixed
    if (m) {
      const whole = parseInt(m[1], 10);
      const num = parseInt(m[2], 10);
      const den = parseInt(m[3], 10);
      const sign = whole < 0 ? -1 : 1;
      const absWhole = Math.abs(whole);
      return new Rational(sign * (absWhole * den + num), den);
    }

    m = hyphen.match(/^([+-]?\d+)\/(\d+)$/); // fraction
    if (m) return new Rational(parseInt(m[1], 10), parseInt(m[2], 10));

    if (/^[+-]?\d+(\.\d+)?$/.test(hyphen)) { // decimal/int
      const x = Number(hyphen);
      return numberToRational(x, 1e-12);
    }
    return null;
  }

  // ---------- continued fraction best-fit ----------
  function bestFitFraction(x, maxDen, tol = 1e-12) {
    if (!Number.isFinite(x)) throw new Error("Invalid number");
    if (x === 0) return new Rational(0, 1);

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const nearInt = Math.round(x);
    if (Math.abs(nearInt - x) <= tol) return new Rational(sign * nearInt, 1);

    let h1 = 1, h0 = 0;
    let k1 = 0, k0 = 1;
    let frac = x;

    for (let i = 0; i < 64; i++) {
      const a = Math.floor(frac);
      const h2 = a * h1 + h0;
      const k2 = a * k1 + k0;

      if (k2 > maxDen) {
        const t = Math.floor((maxDen - k0) / k1);
        return new Rational(sign * (t * h1 + h0), (t * k1 + k0));
      }

      const approx = h2 / k2;
      if (Math.abs(approx - x) <= tol) return new Rational(sign * h2, k2);

      h0 = h1; h1 = h2;
      k0 = k1; k1 = k2;

      const rem = frac - a;
      if (rem === 0) break;
      frac = 1 / rem;
    }
    return new Rational(sign * h1, k1);
  }

  function numberToRational(x, tol = 1e-12) {
    if (Number.isInteger(x)) return new Rational(x, 1);
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    for (let k = 1; k <= 10; k++) {
      const p = 10 ** k;
      const m = Math.round(x * p);
      if (Math.abs(m / p - x) <= tol) return new Rational(sign * m, p);
    }
    return bestFitFraction(sign * x, 1_000_000, tol);
  }

  // ---------- trade rounding (rational exact) ----------
  function roundToStepRational(r, denomStep) {
    // round(n*denomStep/d) to nearest integer; tie -> away from zero
    const q = (r.n * denomStep) / r.d;
    const absq = Math.abs(q);
    const flo = Math.floor(absq);
    const frac = absq - flo;
    let rounded = flo;
    if (frac > 0.5 || nearlyEqual(frac, 0.5, 1e-15)) rounded = flo + 1;
    rounded = q < 0 ? -rounded : rounded;
    return new Rational(rounded, denomStep);
  }

  // ---------- safe parser (shunting yard) ----------
  const OPERATORS = {
    "+": { prec: 2, assoc: "L" },
    "-": { prec: 2, assoc: "L" },
    "×": { prec: 3, assoc: "L" },
    "÷": { prec: 3, assoc: "L" },
    "%": { prec: 4, assoc: "L" }, // postfix unary
    "^": { prec: 5, assoc: "R" },
    "u-": { prec: 6, assoc: "R" }
  };

  const FUNCTIONS = new Set(["sin","cos","tan","log","ln","sqrt","sqr"]);

  function normalizeInput(str, settings) {
    let s = str.replace(/\*/g,"×").replace(/\//g,"÷").replace(/\bpi\b/gi,"π");
    if (settings.acceptHyphenMixed) s = s.replace(/(\d)\-(\d+\/\d+)/g, "$1 $2");
    return s;
  }

  function tokenize(expr, settings) {
    const s = normalizeInput(expr, settings);
    const tokens = [];
    let i = 0;

    const isSpace = (c) => c === " " || c === "\t" || c === "\n";
    const isDigit = (c) => c >= "0" && c <= "9";
    const isLetter = (c) => /[a-z]/i.test(c);

    while (i < s.length) {
      const c = s[i];
      if (isSpace(c)) { i++; continue; }
      if (c === "(" || c === ")") { tokens.push({t:"paren", v:c}); i++; continue; }
      if ("+-×÷^%".includes(c)) { tokens.push({t:"op", v:c}); i++; continue; }
      if (c === "π") { tokens.push({t:"const", v:"pi"}); i++; continue; }
      if (c === "e") { tokens.push({t:"const", v:"e"}); i++; continue; }

      if (isDigit(c) || c === ".") {
        let j = i;
        while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
        const base = s.slice(i, j);

        // mixed "1 3/8"
        if (j < s.length && s[j] === " ") {
          let k = j; while (k < s.length && s[k] === " ") k++;
          let kk = k; while (kk < s.length && (isDigit(s[kk]) || s[kk] === "/")) kk++;
          const maybeFrac = s.slice(k, kk);
          if (/^\d+\/\d+$/.test(maybeFrac)) {
            tokens.push({t:"num", v:`${base} ${maybeFrac}`});
            i = kk; continue;
          }
        }

        // simple "3/8"
        if (j < s.length && s[j] === "/") {
          let kk = j + 1; while (kk < s.length && isDigit(s[kk])) kk++;
          const frac = s.slice(i, kk);
          if (/^\d+\/\d+$/.test(frac)) { tokens.push({t:"num", v:frac}); i = kk; continue; }
        }

        tokens.push({t:"num", v:base});
        i = j; continue;
      }

      if (isLetter(c)) {
        let j = i; while (j < s.length && isLetter(s[j])) j++;
        const name = s.slice(i, j).toLowerCase();
        if (!FUNCTIONS.has(name)) throw new Error(`Unknown: ${name}`);
        tokens.push({t:"fn", v:name});
        i = j; continue;
      }

      throw new Error(`Bad char: ${c}`);
    }
    return tokens;
  }

  function toRPN(tokens) {
    const out = [];
    const stack = [];
    let prev = null;

    for (const tok of tokens) {
      if (tok.t === "num" || tok.t === "const") out.push(tok);
      else if (tok.t === "fn") stack.push(tok);
      else if (tok.t === "op") {
        let op = tok.v;
        if (op === "-" && (!prev || (prev.t === "op" && prev.v !== "%") || (prev.t === "paren" && prev.v === "(") || prev.t === "fn")) op = "u-";

        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.t === "op") {
            const o1 = OPERATORS[op], o2 = OPERATORS[top.v];
            const condL = o1.assoc === "L" && o1.prec <= o2.prec;
            const condR = o1.assoc === "R" && o1.prec < o2.prec;
            if (condL || condR) out.push(stack.pop());
            else break;
          } else if (top.t === "fn") {
            out.push(stack.pop());
          } else break;
        }
        stack.push({t:"op", v:op});
      } else if (tok.t === "paren") {
        if (tok.v === "(") stack.push(tok);
        else {
          while (stack.length && !(stack[stack.length-1].t === "paren" && stack[stack.length-1].v === "(")) out.push(stack.pop());
          if (!stack.length) throw new Error("Mismatched ()");
          stack.pop();
          if (stack.length && stack[stack.length-1].t === "fn") out.push(stack.pop());
        }
      }
      prev = tok;
    }

    while (stack.length) {
      const top = stack.pop();
      if (top.t === "paren") throw new Error("Mismatched ()");
      out.push(top);
    }
    return out;
  }

  function evalRPN(rpn, state) {
    const st = [];

    const toFloat = (v) => v.kind === "float" ? v.x : v.r.toNumber();

    const pushNum = (tok) => {
      if (tok.t === "const") {
        st.push({kind:"float", x: tok.v === "pi" ? Math.PI : Math.E});
        return;
      }
      const r = parseMixedFractionToken(tok.v, state.settings);
      if (!r) throw new Error(`Bad number: ${tok.v}`);
      st.push({kind:"rat", r});
    };

    const angleToRad = (x) => state.settings.angleMode === "DEG" ? (x * Math.PI / 180) : x;

    for (const tok of rpn) {
      if (tok.t === "num" || tok.t === "const") { pushNum(tok); continue; }

      if (tok.t === "fn") {
        const a = st.pop(); if (!a) throw new Error("Missing operand");
        const x = toFloat(a);

        if (tok.v === "sin") st.push({kind:"float", x: Math.sin(angleToRad(x))});
        else if (tok.v === "cos") st.push({kind:"float", x: Math.cos(angleToRad(x))});
        else if (tok.v === "tan") st.push({kind:"float", x: Math.tan(angleToRad(x))});
        else if (tok.v === "log") { if (x <= 0) throw new Error("log domain"); st.push({kind:"float", x: Math.log10(x)}); }
        else if (tok.v === "ln")  { if (x <= 0) throw new Error("ln domain");  st.push({kind:"float", x: Math.log(x)}); }
        else if (tok.v === "sqrt"){ if (x < 0) throw new Error("sqrt domain"); st.push({kind:"float", x: Math.sqrt(x)}); }
        else if (tok.v === "sqr") st.push(a.kind === "rat" ? {kind:"rat", r: a.r.powInt(2)} : {kind:"float", x: x*x});
        else throw new Error("Bad fn");
        continue;
      }

      if (tok.t === "op") {
        const op = tok.v;

        if (op === "u-") {
          const a = st.pop(); if (!a) throw new Error("Missing operand");
          st.push(a.kind === "rat" ? {kind:"rat", r: a.r.neg()} : {kind:"float", x: -a.x});
          continue;
        }
        if (op === "%") {
          const a = st.pop(); if (!a) throw new Error("Missing operand");
          st.push(a.kind === "rat" ? {kind:"rat", r: a.r.div(new Rational(100,1))} : {kind:"float", x: a.x/100});
          continue;
        }

        const b = st.pop(), a = st.pop();
        if (!a || !b) throw new Error("Missing operand");

        const bothRat = a.kind === "rat" && b.kind === "rat";

        if (bothRat) {
          if (op === "+") st.push({kind:"rat", r: a.r.add(b.r)});
          else if (op === "-") st.push({kind:"rat", r: a.r.sub(b.r)});
          else if (op === "×") st.push({kind:"rat", r: a.r.mul(b.r)});
          else if (op === "÷") st.push({kind:"rat", r: a.r.div(b.r)});
          else if (op === "^") {
            if (b.r.isInt()) st.push({kind:"rat", r: a.r.powInt(b.r.n)});
            else st.push({kind:"float", x: Math.pow(a.r.toNumber(), b.r.toNumber())});
          } else throw new Error("Bad op");
          continue;
        }

        const af = toFloat(a), bf = toFloat(b);
        if (op === "+") st.push({kind:"float", x: af + bf});
        else if (op === "-") st.push({kind:"float", x: af - bf});
        else if (op === "×") st.push({kind:"float", x: af * bf});
        else if (op === "÷") { if (bf === 0) throw new Error("Divide by zero"); st.push({kind:"float", x: af / bf}); }
        else if (op === "^") st.push({kind:"float", x: Math.pow(af, bf)});
        else throw new Error("Bad op");
      }
    }

    if (st.length !== 1) throw new Error("Invalid expression");
    return st[0];
  }

  // ---------- App state ----------
  const state = {
    expr: "",
    last: null, // last value {kind, r|x}
    memory: new Rational(0,1),
    history: [],
    settings: {
      angleMode: "DEG",
      fractionMode: false,
      maxDenom: 16,
      acceptHyphenMixed: false,
      tradeMode: false,
      tradeStepDenom: 16,
      precision: 6
    },
    lastDisplay: "decimal", // decimal|fraction
    fracCopyArmed: false
  };

  // ---------- UI ----------
  function setExpr(s) { state.expr = s; $("exprLine").textContent = s || " "; }
  function setOut(main, aux="") { $("resultLine").textContent = main || " "; $("auxLine").textContent = aux || " "; }

  function updateBadges() {
    $("angleBadge").textContent = state.settings.angleMode;
    $("fracBadge").textContent = state.settings.fractionMode ? `FRAC ≤${state.settings.maxDenom}` : "FRAC OFF";
    $("tradeBadge").textContent = state.settings.tradeMode ? `TRADE 1/${state.settings.tradeStepDenom}` : "TRADE OFF";
    $("anglePill").textContent = state.settings.angleMode;
  }

  function valueStrings(val) {
    const p = state.settings.precision;

    const dec = val.kind === "rat" ? formatDecimal(val.r.toNumber(), p) : formatDecimal(val.x, p);

    let frac = "";
    if (val.kind === "rat") frac = toMixedString(val.r);
    else if (state.settings.fractionMode) frac = toMixedString(bestFitFraction(val.x, state.settings.maxDenom, 1e-12));

    let tradeMain = "", tradeAux = "";
    if (state.settings.tradeMode) {
      const baseRat = val.kind === "rat" ? val.r : bestFitFraction(val.x, 1_000_000, 1e-12);
      const rounded = roundToStepRational(baseRat, state.settings.tradeStepDenom);
      tradeMain = toMixedString(rounded);
      tradeAux = `${formatDecimal(rounded.toNumber(), p)} in`;
    }
    return { dec, frac, tradeMain, tradeAux };
  }

  function renderValue(val) {
    state.last = val;
    state.fracCopyArmed = false;

    const { dec, frac, tradeMain, tradeAux } = valueStrings(val);

    if (state.settings.tradeMode) {
      setOut(tradeMain, tradeAux);
      return;
    }

    if (state.lastDisplay === "fraction" && frac) setOut(frac, `≈ ${dec}`);
    else setOut(dec, (state.settings.fractionMode && frac) ? `= ${frac}` : "");
  }

  function renderHistory() {
    const ul = $("historyList");
    ul.innerHTML = "";
    for (const h of state.history) {
      const li = document.createElement("li");
      li.className = "historyItem";
      li.innerHTML = `<div class="historyExpr">${h.expr}</div><div class="historyRes">${h.res}</div>`;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Use result";
      b.onclick = () => insertText(h.forInput);
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  // ---------- actions ----------
  function insertText(t) { setExpr(state.expr + t); }
  function back() { if (state.expr) setExpr(state.expr.slice(0,-1)); }
  function ce() { setExpr(""); setOut("0",""); state.last = null; state.lastDisplay = "decimal"; }
  function ac() { ce(); state.memory = new Rational(0,1); }

  function toggleDegRad() {
    state.settings.angleMode = state.settings.angleMode === "DEG" ? "RAD" : "DEG";
    updateBadges();
  }

  function fracBtn() {
    if (!state.last) return;
    const { frac, dec } = valueStrings(state.last);
    if (!frac) { state.lastDisplay = "decimal"; renderValue(state.last); return; }

    if (state.lastDisplay !== "fraction") {
      state.lastDisplay = "fraction";
      state.fracCopyArmed = true;
      setOut(frac, `≈ ${dec}`);
      return;
    }

    if (state.fracCopyArmed) {
      // copy to input
      setExpr("");
      setExpr(frac);
      state.fracCopyArmed = false;
      return;
    }

    state.lastDisplay = "decimal";
    renderValue(state.last);
  }

  function safeEval() {
    const expr = state.expr.trim();
    if (!expr) return;

    const tokens = tokenize(expr, state.settings);
    const rpn = toRPN(tokens);
    const val = evalRPN(rpn, state);

    renderValue(val);

    const { dec, frac, tradeMain } = valueStrings(val);
    const shown = $("resultLine").textContent.trim();
    const forInput = state.settings.tradeMode ? tradeMain : (state.settings.fractionMode && frac ? frac : dec);

    state.history.unshift({ expr, res: shown, forInput });
    state.history = state.history.slice(0, 20);
    renderHistory();
  }

  function memAdd(sign) {
    if (!state.last) return;
    const r = state.last.kind === "rat" ? state.last.r : bestFitFraction(state.last.x, 1_000_000, 1e-12);
    state.memory = sign > 0 ? state.memory.add(r) : state.memory.sub(r);
  }

  function memRecall() { insertText(toMixedString(state.memory)); }

  // ---------- drawer ----------
  function openDrawer() { $("drawer").classList.add("open"); $("scrim").hidden = false; }
  function closeDrawer(){ $("drawer").classList.remove("open"); $("scrim").hidden = true; }

  // ---------- bind ----------
  function bind() {
    setExpr("");
    setOut("0","");
    updateBadges();
    renderHistory();

    document.body.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;

      const ins = b.getAttribute("data-insert");
      const act = b.getAttribute("data-action");

      try {
        if (ins) { insertText(ins); return; }
        if (!act) return;

        if (act === "equals") safeEval();
        else if (act === "back") back();
        else if (act === "ce") ce();
        else if (act === "ac") ac();
        else if (act === "degRad") toggleDegRad();
        else if (act === "fracBtn") fracBtn();
        else if (act === "mc") state.memory = new Rational(0,1);
        else if (act === "mr") memRecall();
        else if (act === "mplus") memAdd(+1);
        else if (act === "mminus") memAdd(-1);
      } catch (err) {
        setOut("Error", String(err.message || err));
      }
    });

    $("settingsBtn").onclick = openDrawer;
    $("closeDrawerBtn").onclick = closeDrawer;
    $("scrim").onclick = closeDrawer;

    $("anglePill").onclick = toggleDegRad;

    $("fractionMode").onchange = (e) => { state.settings.fractionMode = e.target.checked; updateBadges(); if (state.last) renderValue(state.last); };
    $("maxDenom").onchange = (e) => { state.settings.maxDenom = parseInt(e.target.value,10); updateBadges(); if (state.last) renderValue(state.last); };
    $("hyphenMixed").onchange = (e) => { state.settings.acceptHyphenMixed = e.target.checked; };
    $("tradeMode").onchange = (e) => { state.settings.tradeMode = e.target.checked; updateBadges(); if (state.last) renderValue(state.last); };
    $("tradeStep").onchange = (e) => { state.settings.tradeStepDenom = parseInt(e.target.value,10); updateBadges(); if (state.last) renderValue(state.last); };

    $("precision").oninput = (e) => {
      state.settings.precision = parseInt(e.target.value,10);
      $("precisionVal").textContent = String(state.settings.precision);
      if (state.last) renderValue(state.last);
    };

    $("clearHistoryBtn").onclick = () => { state.history = []; renderHistory(); };

    // init drawer controls
    $("fractionMode").checked = state.settings.fractionMode;
    $("maxDenom").value = String(state.settings.maxDenom);
    $("hyphenMixed").checked = state.settings.acceptHyphenMixed;
    $("tradeMode").checked = state.settings.tradeMode;
    $("tradeStep").value = String(state.settings.tradeStepDenom);
    $("precision").value = String(state.settings.precision);
    $("precisionVal").textContent = String(state.settings.precision);

    // keyboard
    window.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "Enter" || k === "=") { e.preventDefault(); safeEval(); return; }
      if (k === "Backspace") { e.preventDefault(); back(); return; }
      if (k === "Escape") { e.preventDefault(); ac(); return; }
      if (k === "Delete") { e.preventDefault(); ce(); return; }

      const allowed = "0123456789.+-*/()^%";
      if (allowed.includes(k)) {
        e.preventDefault();
        const map = (ch) => ch === "*" ? "×" : (ch === "/" ? "÷" : ch);
        insertText(map(k));
      }
      if (k.toLowerCase() === "p") { e.preventDefault(); insertText("π"); }
      if (k === "e") { e.preventDefault(); insertText("e"); }
    });
  }

  bind();
})();
