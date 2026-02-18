const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");

let expr = "";
let history = [];
let angleMode = "DEG";

function gcd(a,b){ return b ? gcd(b,a%b) : a; }

/* ---------- FRACTION UTIL ---------- */

function decimalToFraction(x, maxDen=16){
    let sign = Math.sign(x);
    x = Math.abs(x);

    let bestNum=0, bestDen=1, bestErr=Infinity;

    for(let d=1; d<=maxDen; d++){
        let n=Math.round(x*d);
        let err=Math.abs(x - n/d);
        if(err<bestErr){
            bestErr=err;
            bestNum=n;
            bestDen=d;
        }
    }

    let g=gcd(bestNum,bestDen);
    bestNum/=g; bestDen/=g;

    return sign<0?`-${bestNum}/${bestDen}`:`${bestNum}/${bestDen}`;
}

/* ---------- TRADE ROUNDING ---------- */

function tradeRound(value, step){
    let frac = eval(step);
    let rounded = Math.round(value/frac)*frac;

    let whole = Math.floor(Math.abs(rounded));
    let remainder = Math.abs(rounded)-whole;

    if(remainder<1e-6) return `${Math.sign(rounded)<0?'-':''}${whole}`;

    let fraction = decimalToFraction(remainder,64);
    return `${Math.sign(rounded)<0?'-':''}${whole} ${fraction}`;
}

/* ---------- TRIG ---------- */

function toRad(x){
    return angleMode==="DEG" ? x*Math.PI/180 : x;
}

/* ---------- SAFE EVAL ---------- */

function compute(e){
    try{
        e=e.replace(/π/g,"Math.PI")
        .replace(/e/g,"Math.E")
        .replace(/sin\(/g,"Math.sin(toRad(")
        .replace(/cos\(/g,"Math.cos(toRad(")
        .replace(/tan\(/g,"Math.tan(toRad(")
        .replace(/√/g,"Math.sqrt")
        .replace(/log/g,"Math.log10")
        .replace(/ln/g,"Math.log");

        return Function("toRad","return "+e)(toRad);
    }catch{
        return NaN;
    }
}

/* ---------- BUTTON INPUT ---------- */

document.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click",()=>{
        const val=btn.textContent;

        if(val==="="){
            let res=compute(expr);
            if(isNaN(res)) return;

            resultEl.textContent=res.toFixed(6);
            history.unshift(`${expr} = ${res}`);
            history=history.slice(0,20);
            renderHistory();
            expr="";
            expressionEl.textContent="";
            return;
        }

        if(val==="AC"){ expr=""; resultEl.textContent="0"; expressionEl.textContent=""; return; }
        if(val==="CE"){ expr=expr.slice(0,-1); expressionEl.textContent=expr; return; }

        expr+=val;
        expressionEl.textContent=expr;
    });
});

/* ---------- HISTORY ---------- */

function renderHistory(){
    historyEl.innerHTML=history.map(h=>`<div>${h}</div>`).join("");
}

/* ---------- FRAC BUTTON ---------- */

document.getElementById("fracBtn").onclick=()=>{
    let val=parseFloat(resultEl.textContent);
    if(isNaN(val)) return;
    resultEl.textContent=decimalToFraction(val,16);
};

/* ---------- SETTINGS ---------- */

const drawer=document.getElementById("drawer");
document.getElementById("settingsBtn").onclick=()=>{
    drawer.classList.toggle("open");
};

document.getElementById("angleMode").onchange=(e)=>{
    angleMode=e.target.value;
};

document.addEventListener("keydown",(e)=>{
    if(e.key==="Enter") document.getElementById("equals").click();
    if(e.key==="Backspace") document.getElementById("back").click();
});
