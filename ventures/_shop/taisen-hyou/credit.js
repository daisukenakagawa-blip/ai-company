/* 印刷の下に店名を1行入れる（2026-11-25 試験。お試し版は常に、製品版は選んだときだけ）。データは送信しない */
(function () {
  "use strict";
  var demo = !!window.CREDIT_DEMO, cb = null;
  var TXT = "作成：GENHAYL の小さな道具　genhayl-shop.pages.dev/?ref=print";
  var m = document.querySelector("main");
  if (m) {
    var p = document.createElement("p"); p.className = "note"; p.style.marginTop = "12px";
    if (demo) p.textContent = "お試し版では、印刷の下に「" + TXT + "」が1行入ります（製品版では入れるかを選べます）。";
    else { var l = document.createElement("label"); cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "credit"; l.appendChild(cb); l.appendChild(document.createTextNode(" 印刷の下に、この道具の名前と場所を1行入れる（「" + TXT + "」）")); p.appendChild(l); }
    m.appendChild(p);
  }
  window.addEventListener("beforeprint", function () {
    var pa = document.getElementById("printArea"); if (!pa) return;
    var old = pa.querySelector(".gcredit"); if (old) old.parentNode.removeChild(old);
    if (!demo && !(cb && cb.checked)) return;
    var d = document.createElement("div"); d.className = "gcredit"; d.textContent = TXT;
    d.style.cssText = "font-size:7pt;color:#555;text-align:right;margin-top:2mm;font-weight:400";
    pa.appendChild(d);
  });
})();
