/* ===== Общий скрипт: переход на запись, корзина, рендер продукции ===== */

function roleLabel(key) { var r = ROLES.find(function (x) { return x.key === key; }); return r ? r.label : ""; }

/* ===== Запись =====
   Своего календаря у сайта нет и быть не может без прокси: расписание живёт в СберОнлайн
   (SOnline), его API не отдаёт данные чужим доменам (CORS — проверено 2026-11-05), а прямой
   переход на конкретную услугу виджет не поддерживает (проверено 2026-11-06: якорь #service-<id>
   и параметры ?service/?serviceId/?services игнорируются). Поэтому услуга выбирается в СберОнлайн,
   а здесь только переход туда. Прокси и живой календарь — отдельная задача (см. отчёт). */
document.addEventListener("click", function (e) {
  var b = e.target.closest(".btn-book");
  if (b) { e.preventDefault(); window.open(WIDGET, "_blank", "noopener,noreferrer"); }
});

/* ===== Esc и ловушка фокуса для открытой модалки (корзина) ===== */
document.addEventListener("keydown", function (e) {
  var open = document.querySelector(".modal-bg.open");
  if (!open) return;
  if (e.key === "Escape") { cartClose(); return; }
  if (e.key === "Tab") {
    var f = [...open.querySelectorAll("button, a[href], input, select, [tabindex]:not([tabindex='-1'])")].filter(function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
});

/* ===== Корзина ===== */
var CART_KEY = "lyubava_cart";
var ASSET_BASE = document.documentElement.getAttribute("data-base") || "";
var cartLastFocus = null;

function cartLoad() {
  var raw;
  try { raw = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; }
  if (!Array.isArray(raw)) return [];
  /* Корзина лежит в браузере, и подменить в ней можно что угодно:
     название, цену, картинку. Поэтому из localStorage берём только id и количество,
     а остальное восстанавливаем по каталогу. Заодно это чинит подделку цены. */
  return raw.map(function (i) {
    var t = i && findProduct(i.id);
    if (!t) return null;
    var qty = parseInt(i.qty, 10);
    if (!(qty > 0)) qty = 1;
    if (qty > 99) qty = 99;
    return { id: i.id, title: t.title, price: t.price, img: t.img, qty: qty };
  }).filter(Boolean);
}
function cartSave(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  cartSync();
  cartRender();
}
function parsePrice(s) { return Number(String(s).replace(/[^\d]/g, "")) || 0; }
function fmtPrice(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽"; }

/* Текст заказа для WhatsApp: приветствие, список с суммами, итог. */
function orderText() {
  var items = cartLoad();
  if (!items.length) return "";
  var count = 0, total = 0;
  var lines = items.map(function (i, n) {
    var sum = parsePrice(i.price) * i.qty;
    count += i.qty; total += sum;
    return (n + 1) + ". " + i.title + ": " + i.qty + " шт, " + fmtPrice(sum);
  });
  return ORDER_GREETING + "\n\n" + lines.join("\n") + "\n\nИтого: " + count + " шт, " +
    (total > 0 ? fmtPrice(total) : "уточняется");
}

function orderSend() {
  var c = document.getElementById("cartConsent");
  if (c && !c.checked) return;
  var t = orderText();
  if (!t) return;
  window.open("https://wa.me/" + ORDER_PHONE + "?text=" + encodeURIComponent(t), "_blank", "noopener,noreferrer");
}
function cartCount() { return cartLoad().reduce(function (s, i) { return s + i.qty; }, 0); }
function findProduct(id) { return PRODUCTS.find(function (t) { return productId(t) === id; }); }

function cartSync() {
  var n = cartCount();
  document.querySelectorAll(".cart-count").forEach(function (el) {
    el.textContent = n;
    el.hidden = n === 0;
  });
}

/* Окно корзины собирается из JS, чтобы не дублировать разметку на страницах */
function buildCartModal() {
  var wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.id = "cartModalBg";
  wrap.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cartTitle">' +
      '<div class="m-head"><h2 id="cartTitle">Корзина</h2>' +
        '<button class="m-close" type="button" aria-label="Закрыть корзину" id="cartClose">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
        "</button></div>" +
      '<div class="m-body">' +
        '<div id="cartRows" class="cart-rows"></div>' +
        '<div class="cart-foot">' +
          '<div class="cart-total"><span>Итого</span><b class="mono" id="cartTotal">0 ₽</b></div>' +
          '<div class="consent">' +
            '<input type="checkbox" id="cartConsent" aria-required="true">' +
            '<label for="cartConsent">Я ознакомлен(а) с <a href="/privacy/" target="_blank" rel="noopener noreferrer">политикой обработки персональных данных</a> и согласен(на) на обработку данных для оформления заказа.</label>' +
          '</div>' +
          '<div class="cart-actions">' +
            '<button class="btn btn-primary" type="button" id="cartWa">Отправить в WhatsApp</button>' +
            '<a class="btn btn-secondary" href="tel:+' + ORDER_PHONE + '">Позвонить</a>' +
          '</div>' +
          '<p class="m-note">Список уже собран: отправьте его в WhatsApp или позвоните.</p>' +
        "</div>" +
      "</div>" +
    "</div>";
  document.body.appendChild(wrap);
  wrap.addEventListener("click", function (e) { if (e.target === wrap) cartClose(); });
  wrap.querySelector("#cartClose").addEventListener("click", cartClose);
  wrap.querySelector("#cartWa").addEventListener("click", orderSend);
  wrap.querySelector("#cartConsent").addEventListener("change", consentSync);
}

function cartRender() {
  var rows = document.getElementById("cartRows");
  if (!rows) return;
  var items = cartLoad();
  var total = 0;
  rows.innerHTML = "";
  if (!items.length) {
    rows.innerHTML = '<p class="cart-empty">Корзина пуста. Добавьте продукцию из каталога.</p>';
  }
  items.forEach(function (i) {
    total += parsePrice(i.price) * i.qty;
    var r = document.createElement("div");
    r.className = "cart-row";
    r.innerHTML =
      (i.img ? '<img src="' + ASSET_BASE + i.img + '" alt="" width="96" height="96">' : '<div class="p-ph p-ph-sm" aria-hidden="true">' + i.title.slice(0, 1) + '</div>') +
      '<div class="cr-main"><div class="cr-t">' + i.title + '</div><div class="cr-p mono">' + i.price + "</div></div>" +
      '<div class="cr-qty">' +
        '<button type="button" class="qty-btn" data-act="dec" data-id="' + i.id + '" aria-label="Меньше">−</button>' +
        '<span class="mono">' + i.qty + "</span>" +
        '<button type="button" class="qty-btn" data-act="inc" data-id="' + i.id + '" aria-label="Больше">+</button>' +
      "</div>" +
      '<button type="button" class="cr-del" data-act="del" data-id="' + i.id + '" aria-label="Убрать из корзины">Убрать</button>';
    rows.appendChild(r);
  });
  var t = document.getElementById("cartTotal");
  if (t) t.textContent = items.length && total === 0 ? "уточняется" : fmtPrice(total);
  consentSync();
}

/* Согласие на обработку данных: без галочки заказ не отправляется */
function consentSync() {
  var c = document.getElementById("cartConsent");
  var wa = document.getElementById("cartWa");
  if (!c || !wa) return;
  wa.disabled = !c.checked || !cartLoad().length;
}

document.addEventListener("click", function (e) {
  var pick = e.target.closest(".pick");
  if (pick) { pickToggle(pick.dataset.id); return; }
  var tgl = e.target.closest(".pd-toggle");
  if (tgl) {
    var card = tgl.closest(".pcard");
    var open = card.classList.toggle("desc-open");
    tgl.setAttribute("aria-expanded", String(open));
    tgl.textContent = open ? "Свернуть" : "Подробнее";
    return;
  }
  var steps = e.target.closest(".steps-toggle");
  if (steps) {
    var col = steps.closest(".steps-col");
    var shown = col.classList.toggle("open");
    steps.setAttribute("aria-expanded", String(shown));
    return;
  }
  var q = e.target.closest("[data-act]");
  if (q) {
    var items = cartLoad();
    var id = q.dataset.id;
    if (q.dataset.act === "del") items = items.filter(function (i) { return i.id !== id; });
    else {
      var row = items.find(function (i) { return i.id === id; });
      if (row) {
        if (q.dataset.act === "inc" && row.qty < 99) row.qty += 1;
        if (q.dataset.act === "dec") row.qty -= 1;
        if (row.qty <= 0) items = items.filter(function (i) { return i.id !== id; });
      }
    }
    cartSave(items);
    return;
  }
  var open = e.target.closest(".cart-open");
  if (open) { cartOpen(); }
});

function cartOpen() {
  cartLastFocus = document.activeElement;
  var c = document.getElementById("cartConsent");
  if (c) c.checked = false;
  cartRender();
  document.getElementById("cartModalBg").classList.add("open");
  document.body.classList.add("modal-open");
  var first = document.querySelector("#cartModalBg .m-close");
  if (first) first.focus();
}
function cartClose() {
  var bg = document.getElementById("cartModalBg");
  if (bg) bg.classList.remove("open");
  document.body.classList.remove("modal-open");
  if (cartLastFocus) cartLastFocus.focus();
}

buildCartModal();
cartSync();
cartRender();

/* ===== Выбор товаров: галочки на карточках + одна кнопка «В корзину» ===== */
var picked = {};

function buildPickBar() {
  var bar = document.createElement("div");
  bar.className = "pickbar";
  bar.id = "pickBar";
  bar.innerHTML =
    '<span class="pb-count">Выбрано: <b class="mono" id="pickCount">0</b></span>' +
    '<span class="pb-sum mono" id="pickSum">0 ₽</span>' +
    '<button class="btn btn-primary btn-sm" type="button" id="pickAdd">В корзину</button>';
  document.body.appendChild(bar);
  document.getElementById("pickAdd").addEventListener("click", pickAddAll);
}

function pickSync() {
  var ids = Object.keys(picked).filter(function (k) { return picked[k]; });
  var sum = 0;
  ids.forEach(function (id) { var t = findProduct(id); if (t) sum += parsePrice(t.price); });
  document.querySelectorAll(".pcard").forEach(function (c) {
    var on = !!picked[c.dataset.id];
    c.classList.toggle("picked", on);
    var b = c.querySelector(".pick");
    if (b) b.setAttribute("aria-pressed", String(on));
  });
  var bar = document.getElementById("pickBar");
  var count = document.getElementById("pickCount");
  if (count) count.textContent = ids.length;
  var sumEl = document.getElementById("pickSum");
  if (sumEl) sumEl.textContent = ids.length && sum === 0 ? "уточняется" : fmtPrice(sum);
  if (bar) bar.classList.toggle("show", ids.length > 0);
}

function pickToggle(id) {
  picked[id] = !picked[id];
  pickSync();
}

function pickAddAll() {
  var ids = Object.keys(picked).filter(function (k) { return picked[k]; });
  if (!ids.length) return;
  var items = cartLoad();
  ids.forEach(function (id) {
    var row = items.find(function (i) { return i.id === id; });
    if (row) { row.qty += 1; return; }
    var t = findProduct(id);
    if (t) items.push({ id: id, title: t.title, price: t.price, img: t.img, qty: 1 });
  });
  picked = {};
  cartSave(items);
  pickSync();
  cartOpen();
}

buildPickBar();

/* ===== Рендер продукции ===== */
function productId(t) {
  if (t.id) return t.id;
  if (t.img) return t.img.split("/").pop().replace(/\.\w+$/, "");
  return t.title.toLowerCase().replace(/[^a-zа-яё0-9]+/g, "-").replace(/^-|-$/g, "");
}

function productCard(t, onCatalog) {
  var c = document.createElement("div");
  c.className = "pcard" + (onCatalog ? " on-cat" : "");
  c.dataset.role = t.role;
  c.dataset.id = productId(t);
  var pid = "pd-" + productId(t);
  c.innerHTML =
    '<div class="phead">' +
      '<span class="role">' + roleLabel(t.role) + "</span>" +
      '<button class="pick" type="button" data-id="' + productId(t) + '" aria-pressed="false" aria-label="Выбрать товар">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' +
      "</button>" +
    "</div>" +
    (t.img ? '<img src="' + ASSET_BASE + t.img + '" alt="' + t.title + '" width="540" height="540" loading="lazy" decoding="async">' : '<div class="p-ph" aria-hidden="true">' + t.title.slice(0, 1) + '</div>') +
    '<div class="pt">' + t.title + "</div>" +
    '<div class="pd" id="' + pid + '">' + t.desc + "</div>" +
    '<button class="pd-toggle" type="button" aria-expanded="false" aria-controls="' + pid + '">Подробнее</button>' +
    '<div class="pp">' + t.price + "</div>";
  return c;
}

/* Витрина на главной: ходовые позиции */
(function () {
  var grid = document.getElementById("productsGrid");
  if (!grid) return;
  PRODUCTS.filter(function (t) { return t.hot; }).forEach(function (t) { grid.appendChild(productCard(t, false)); });
})();

/* Каталог: все позиции + фильтры */
(function () {
  var grid = document.getElementById("catalogGrid");
  if (!grid) return;
  var count = document.getElementById("catalogCount");
  var chips = document.getElementById("chips");
  var cards = PRODUCTS.map(function (t) { var c = productCard(t, true); grid.appendChild(c); return c; });
  function applyFilter(key) {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = key === "all" || c.dataset.role === key;
      c.classList.toggle("hide", !ok);
      if (ok) {
        shown++;
        c.classList.remove("flash-in");
        void c.offsetWidth;
        c.classList.add("flash-in");
      }
    });
    count.textContent = shown + " " + plural(shown);
  }
  function plural(n) {
    var m = n % 10, h = n % 100;
    if (h >= 11 && h <= 14) return "позиций";
    if (m === 1) return "позиция";
    if (m >= 2 && m <= 4) return "позиции";
    return "позиций";
  }
  var mk = function (key, label, pressed) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = label;
    b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("click", function () {
      [...chips.querySelectorAll(".chip")].forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      applyFilter(key);
    });
    chips.appendChild(b);
  };
  mk("all", "Все", true);
  ROLES.forEach(function (r) { mk(r.key, r.label, false); });
  applyFilter("all");
})();
