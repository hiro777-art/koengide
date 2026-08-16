#!/usr/bin/env node
/**
 * rebuild-all.js
 * 戸田市公園ガイド - 全87ページ一括再生成スクリプト
 *
 * 【使い方】
 *   node rebuild-all.js          … ドライラン（何も書き換えない・差分だけ表示）
 *   node rebuild-all.js --write  … 実際に parks/*.html を書き出す
 *
 * 【置き場所】
 *   C:\Users\hsasa\Downloads\koengide\rebuild-all.js  （リポジトリのルート）
 *
 * 【やること】
 *   1. Supabase から87件を取得（読み取りのみ・publishable key）
 *   2. images/parks/<id>/ をローカルで走査して写真の有無・枚数を判定
 *   3. 既存の parks/<id>.html から手書き資産を救出
 *        - ✨この公園の特徴（3点）
 *        - 🌳公園について（本文）
 *        - alt テキスト
 *        - 設備ピル（← Supabaseより正確なのでこちらを正とする）
 *   4. 全ページを同一テンプレートで再生成
 *        - 設備を3値表示（あり／なし／未確認）
 *        - GA4 を全ページに追加
 *        - canonical / og:url を www ありに統一
 *        - 内部リンクを ../ に統一
 *        - 中身のないページに noindex
 *        - BreadcrumbList 構造化データを追加
 *   5. sync-db.sql を出力（HTMLの設備をSupabaseへ書き戻すSQL）
 *
 * 【注意】
 *   Supabaseへの書き込みは行いません。生成された sync-db.sql を
 *   自分でSQL Editorに貼って実行してください。
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ============================================================
// 設定
// ============================================================
const SUPABASE_URL = 'https://cxqzrbghdibahedstrrv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Jceze5gKAJ6VQbZc4_p8HA_aMNPCEXa';
const SITE_BASE    = 'https://www.koengide.com';
const GA4_ID       = 'G-TY1M6QFYVZ';

const ROOT       = process.cwd();
const PARKS_DIR  = path.join(ROOT, 'parks');
const IMAGES_DIR = path.join(ROOT, 'images', 'parks');

const WRITE = process.argv.includes('--write');

// ============================================================
// 設備マスター
// ============================================================
const FACILITIES = [
  { key: 'has_swing',            icon: '🎠', label: 'ブランコ' },
  { key: 'has_slide',            icon: '🛝', label: 'すべり台' },
  { key: 'has_sandbox',          icon: '🏖',  label: '砂場' },
  { key: 'has_toilet',           icon: '🚻', label: 'トイレ' },
  { key: 'has_water',            icon: '💧', label: '水遊び' },
  { key: 'has_complex_play',     icon: '🏗',  label: '複合遊具' },
  { key: 'has_bench',            icon: '🪑', label: 'ベンチ' },
  { key: 'has_shade',            icon: '🌳', label: '日陰あり' },
  { key: 'has_ballplay',         icon: '⛹',  label: 'ボール遊びOK' },
  { key: 'has_health_equipment', icon: '🏋',  label: '健康器具' },
  { key: 'has_parking',          icon: '🅿',  label: '駐車場' },
  { key: 'has_dog',              icon: '🐕', label: '犬の散歩OK' },
];

// ============================================================
// ユーティリティ
// ============================================================
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function log(...a) { console.log(...a); }
function hr(c = '─', n = 60) { console.log(c.repeat(n)); }

// ============================================================
// Supabase（読み取りのみ）
// ============================================================
async function fetchAllParks() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/parks?select=*&order=id.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase接続エラー: ${res.status} ${await res.text()}`);
  return res.json();
}

// ============================================================
// 写真の走査
// ============================================================
function scanPhotos(id) {
  const dir = path.join(IMAGES_DIR, String(id));
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => /^\d+_\d+\.jpg$/i.test(f)).length;
}

// ============================================================
// 既存HTMLから手書き資産を救出
// ============================================================
function extractExisting(id) {
  const file = path.join(PARKS_DIR, `${id}.html`);
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf-8');

  // ✨ 特徴
  const hlBlock = html.match(/<div class="highlight-box">([\s\S]*?)<\/div>/);
  const points = hlBlock
    ? [...hlBlock[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].trim())
    : [];

  // 🌳 公園について
  const abBlock = html.match(/<section class="about-section">([\s\S]*?)<\/section>/);
  const about = abBlock
    ? [...abBlock[1].matchAll(/<p>([\s\S]*?)<\/p>/g)]
        .map(m => m[1].replace(/<br\s*\/?>/g, '\n').trim())
        .filter(Boolean)
    : [];

  // 📷 alt（modalの「拡大」は除外）
  const galBlock = html.match(/<section class="gallery">([\s\S]*?)<\/section>/);
  const alts = galBlock
    ? [...galBlock[1].matchAll(/alt="([^"]*)"/g)].map(m => m[1])
    : [];

  // 🎪 設備ピル（この形式を持つのはリッチ版のみ）
  const pills = {};
  let hasPills = false;
  for (const m of html.matchAll(/<span class="fac-pill(\s+off)?"[^>]*>([\s\S]*?)<\/span>/g)) {
    const isOff = Boolean(m[1]);
    const text  = m[2];
    const fac = FACILITIES.find(f => text.includes(f.label));
    if (fac) { pills[fac.key] = !isOff; hasPills = true; }
  }

  return { points, about, alts, pills: hasPills ? pills : null };
}

// ============================================================
// HTML生成
// ============================================================
function buildHTML(park, ctx) {
  const { photoCount, points, about, alts, facts, noindex } = ctx;
  const pid  = park.id;
  const name = esc(park.name);
  const addr = esc(park.address || '');
  const area = esc(park.area || '');
  const url  = `${SITE_BASE}/parks/${pid}.html`;
  const ogImg = photoCount > 0
    ? `${SITE_BASE}/images/parks/${pid}/${pid}_01.jpg`
    : `${SITE_BASE}/images/ogp-default.jpg`;

  // --- 設備ピル（3値） ---
  const pillsHTML = FACILITIES.map(f => {
    const v = facts[f.key];
    if (v === true)  return `      <span class="fac-pill">${f.icon} ${f.label}</span>`;
    if (v === false) return `      <span class="fac-pill off">${f.icon} ${f.label}</span>`;
    return `      <span class="fac-pill unknown">${f.icon} ${f.label}<em>未確認</em></span>`;
  }).join('\n');

  const unknownCount = FACILITIES.filter(f => facts[f.key] !== true && facts[f.key] !== false).length;
  const unknownNote = unknownCount > 0
    ? `\n      <p class="fac-note">「未確認」は現地調査がまだ済んでいない項目です。設備が無いという意味ではありません。</p>`
    : '';

  // --- 特徴 ---
  const highlightHTML = points.length
    ? `  <div class="highlight-box">
    <h2>✨ この公園の特徴</h2>
    <ul>
${points.map(p => `      <li>${p}</li>`).join('\n')}
    </ul>
  </div>
`
    : '';

  // --- 写真 ---
  let galleryHTML = '';
  if (photoCount > 0) {
    const mainAlt = esc(alts[0] || `${park.name} 写真1`);
    const subs = Array.from({ length: photoCount - 1 }, (_, i) => {
      const num = String(i + 2).padStart(2, '0');
      const alt = esc(alts[i + 1] || `${park.name} 写真${i + 2}`);
      return `      <img src="../images/parks/${pid}/${pid}_${num}.jpg" alt="${alt}" loading="lazy" onclick="openModal(this.src)">`;
    }).join('\n');
    galleryHTML = `  <section class="gallery">
    <h2 class="section-title">📷 写真</h2>
    <img class="gallery-main" src="../images/parks/${pid}/${pid}_01.jpg" alt="${mainAlt}" onclick="openModal(this.src)">
${subs ? `    <div class="gallery-sub">\n${subs}\n    </div>` : ''}
  </section>
  <div class="modal" id="modal" onclick="closeModal()">
    <span class="modal-close">✕</span>
    <img id="modal-img" src="" alt="拡大">
  </div>
`;
  }

  // --- 本文 ---
  const aboutHTML = about.length
    ? `  <section class="about-section">
    <h2 class="section-title">🌳 公園について</h2>
${about.map(p => `    <p>${p.replace(/\n/g, '<br>')}</p>`).join('\n')}
  </section>
`
    : `  <section class="about-section pending">
    <h2 class="section-title">🌳 公園について</h2>
    <p>この公園はまだ現地調査が済んでいません。写真と詳しい情報は順次追加していきます。</p>
  </section>
`;

  // --- 構造化データ ---
  const ldPark = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Park',
    name: park.name,
    address: {
      '@type': 'PostalAddress',
      addressRegion: '埼玉県',
      addressLocality: '戸田市',
      streetAddress: park.address,
      addressCountry: 'JP',
    },
    geo: { '@type': 'GeoCoordinates', latitude: park.lat, longitude: park.lng },
    url,
    ...(photoCount > 0 ? { image: ogImg } : {}),
  });

  const ldCrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム',   item: `${SITE_BASE}/` },
      { '@type': 'ListItem', position: 2, name: park.area,  item: `${SITE_BASE}/` },
      { '@type': 'ListItem', position: 3, name: park.name,  item: url },
    ],
  });

  const mapSrc = `https://maps.google.com/maps?q=${park.lat},${park.lng}&z=16&output=embed`;

  const nearbyUrl = `${SUPABASE_URL}/rest/v1/parks?select=id,name,area&area=eq.${encodeURIComponent(park.area || '')}&id=neq.${pid}&limit=5`;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">${noindex ? '\n<meta name="robots" content="noindex,follow">' : ''}
<title>${name} - 戸田市公園ガイド</title>
<meta name="description" content="戸田市${addr}にある「${name}」の詳細情報。遊具・設備・アクセス・地図を掲載。">
<meta property="og:title" content="${name} - 戸田市公園ガイド">
<meta property="og:description" content="${name}の設備・アクセス情報。戸田市公園ガイド。">
<meta property="og:image" content="${ogImg}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="戸田市公園ガイド">
<link rel="canonical" href="${url}">
<script type="application/ld+json">${ldPark}<\/script>
<script type="application/ld+json">${ldCrumb}<\/script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"><\/script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${GA4_ID}');
<\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;background:#f5f7fa;color:#333;line-height:1.7}
header{background:linear-gradient(135deg,#2e7d32 0%,#1565c0 100%);padding:16px 20px;text-align:center}
header a{color:#fff;text-decoration:none;font-size:1.1rem;font-weight:bold}
.breadcrumb{background:#fff;padding:10px 20px;font-size:.8rem;color:#666;border-bottom:1px solid #e0e0e0}
.breadcrumb a{color:#1565c0;text-decoration:none}
main{max-width:800px;margin:0 auto;padding:20px 16px 40px}
.park-header{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.park-badge{display:inline-block;background:linear-gradient(135deg,#2e7d32,#1565c0);color:#fff;font-size:.75rem;padding:3px 10px;border-radius:20px;margin-bottom:10px}
.park-header h1{font-size:1.5rem;font-weight:bold;color:#1a1a1a;margin-bottom:6px}
.park-header .address{font-size:.85rem;color:#666}
.highlight-box{background:#fffde7;border-left:4px solid #f9a825;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px}
.highlight-box h2{font-size:.9rem;color:#f57f17;margin-bottom:10px;font-weight:bold}
.highlight-box ul{list-style:none}
.highlight-box ul li{padding:4px 0;font-size:.9rem}
.highlight-box ul li::before{content:'⭐ '}
.section-title{font-size:1rem;font-weight:bold;color:#333;margin-bottom:12px;padding-left:10px;border-left:3px solid #2e7d32}
.gallery{margin-bottom:24px}
.gallery-main{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;cursor:pointer;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.gallery-sub{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.gallery-sub img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;cursor:pointer}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:1000;align-items:center;justify-content:center}
.modal.open{display:flex}
.modal img{max-width:92vw;max-height:88vh;border-radius:8px;object-fit:contain}
.modal-close{position:absolute;top:16px;right:20px;color:#fff;font-size:2rem;cursor:pointer}
.about-section{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.about-section p{font-size:.9rem;margin-bottom:12px;line-height:1.8}
.about-section p:last-child{margin-bottom:0}
.about-section.pending p{color:#888;font-size:.85rem}
.facilities{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.fac-pills{display:flex;flex-wrap:wrap;gap:8px}
.fac-pill{display:inline-flex;align-items:center;gap:4px;background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32;border-radius:20px;padding:5px 12px;font-size:.8rem;font-weight:bold;white-space:nowrap}
.fac-pill.off{background:#f5f5f5;border-color:#e0e0e0;color:#bbb;text-decoration:line-through}
.fac-pill.unknown{background:#fff;border:1px dashed #d5d5d5;color:#aaa;font-weight:normal}
.fac-pill.unknown em{font-style:normal;font-size:.68rem;color:#c0c0c0;margin-left:2px}
.fac-note{margin-top:12px;font-size:.74rem;color:#999;line-height:1.6}
.map-section{margin-bottom:24px}
.map-section iframe{width:100%;height:280px;border:none;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.map-link{display:block;text-align:center;margin-top:10px;padding:12px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:8px;font-size:.88rem;font-weight:bold}
.info-table{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.info-table table{width:100%;border-collapse:collapse;font-size:.87rem}
.info-table td{padding:9px 10px;border-bottom:1px solid #f0f0f0}
.info-table td:first-child{color:#666;width:90px;white-space:nowrap}
.back-btn{display:inline-block;background:linear-gradient(135deg,#2e7d32,#1565c0);color:#fff;text-decoration:none;padding:12px 28px;border-radius:30px;font-size:.9rem;font-weight:bold;margin-bottom:24px}
.nearby-section{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.nearby-list{list-style:none}
.nearby-item{margin-bottom:8px}
.nearby-item a{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #e0e0e0;border-radius:8px;text-decoration:none;color:#333;font-size:.9rem}
.nearby-item a:hover{background:#f5f7fa;border-color:#1565c0}
.nearby-area-tag{font-size:.75rem;color:#888}
.updated{text-align:right;font-size:.72rem;color:#aaa;margin-bottom:16px}
footer{background:#263238;color:#aaa;text-align:center;padding:24px 16px;font-size:.78rem;line-height:1.9}
footer a{color:#80cbc4;text-decoration:none}
</style>
</head>
<body>
<header><a href="../">🌳 戸田市公園ガイド</a></header>
<nav class="breadcrumb"><a href="../">ホーム</a> › <a href="../">${area}</a> › ${name}</nav>
<main>
  <div class="park-header">
    <span class="park-badge">${area}</span>
    <h1>${name}</h1>
    <p class="address">📍 埼玉県戸田市${addr}</p>
  </div>
${highlightHTML}${galleryHTML}  <section class="facilities">
    <h2 class="section-title">🎪 設備・施設</h2>
    <div class="fac-pills">
${pillsHTML}
    </div>${unknownNote}
  </section>
${aboutHTML}  <section class="map-section">
    <h2 class="section-title">🗺 アクセス</h2>
    <iframe src="${mapSrc}" loading="lazy" title="${name}の地図"></iframe>
    <a class="map-link" href="https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}" target="_blank" rel="noopener">🗺 Googleマップで経路を調べる</a>
  </section>
  <section class="info-table">
    <h2 class="section-title">ℹ️ 基本情報</h2>
    <table>
      <tr><td>公園名</td><td>${name}</td></tr>
      <tr><td>住所</td><td>埼玉県戸田市${addr}</td></tr>
      <tr><td>エリア</td><td>${area}</td></tr>
    </table>
  </section>
  <section class="nearby-section" id="nearbySection">
    <h2 class="section-title">🌿 同じエリアの公園</h2>
    <ul class="nearby-list" id="nearbyList"></ul>
  </section>
  <p class="updated">ページ更新日：${today}</p>
  <a href="../" class="back-btn">← 公園一覧に戻る</a>
</main>
<footer>
  <p>※掲載情報は調査時点のものです。設備の撤去・変更等により実際と異なる場合があります。</p>
  <p>お出かけ前に<a href="https://www.city.toda.saitama.jp" target="_blank" rel="noopener">戸田市公式サイト</a>でご確認ください。</p>
  <p style="margin-top:10px;">© 2026 戸田市公園ガイド</p>
</footer>
<script>
function openModal(s){var m=document.getElementById('modal');if(!m)return;document.getElementById('modal-img').src=s;m.classList.add('open');}
function closeModal(){var m=document.getElementById('modal');if(m)m.classList.remove('open');}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});
(async function(){
  try{
    var r=await fetch('${nearbyUrl}',{headers:{'apikey':'${SUPABASE_KEY}','Authorization':'Bearer ${SUPABASE_KEY}'}});
    var parks=await r.json();
    var list=document.getElementById('nearbyList');
    if(!Array.isArray(parks)||!parks.length){document.getElementById('nearbySection').style.display='none';return;}
    parks.forEach(function(p){
      var li=document.createElement('li');
      li.className='nearby-item';
      li.innerHTML='<a href="./'+p.id+'.html"><span>'+p.name+'</span><span class="nearby-area-tag">'+p.area+' \\u203a</span></a>';
      list.appendChild(li);
    });
  }catch(e){var s=document.getElementById('nearbySection');if(s)s.style.display='none';}
})();
<\/script>
</body>
</html>
`;
}

// ============================================================
// メイン
// ============================================================
async function main() {
  log('\n🌳 戸田市公園ガイド - 全ページ一括再生成');
  log(WRITE ? '   モード: 書き込み (--write)' : '   モード: ドライラン（--write を付けると実際に書き出します）');
  hr();

  if (!fs.existsSync(PARKS_DIR)) {
    throw new Error(`parks/ が見つかりません。リポジトリのルートで実行してください（現在: ${ROOT}）`);
  }

  log('\n📡 Supabaseから公園データを取得中...');
  const parks = await fetchAllParks();
  log(`   ${parks.length} 件取得`);

  const stats = {
    total: parks.length,
    withPhotos: 0,
    rescued: 0,
    noindex: 0,
    facsFromHtml: 0,
    written: 0,
  };
  const sqlLines = [];
  const rows = [];

  for (const park of parks) {
    const id = park.id;
    const photoCount = scanPhotos(id);
    const prev = extractExisting(id);

    if (photoCount > 0) stats.withPhotos++;

    const points = prev?.points?.length ? prev.points : [];
    const about  = prev?.about?.length  ? prev.about  : [];
    const alts   = prev?.alts?.length   ? prev.alts   : [];
    if (points.length || about.length) stats.rescued++;

    // 設備：HTMLにピルがあればそちらを正とし、無ければDBの値
    const facts = {};
    let usedHtml = false;
    for (const f of FACILITIES) {
      if (prev?.pills && Object.prototype.hasOwnProperty.call(prev.pills, f.key)) {
        facts[f.key] = prev.pills[f.key];
        usedHtml = true;
      } else {
        const v = park[f.key];
        facts[f.key] = (v === true || v === false) ? v : null;
      }
    }
    if (usedHtml) {
      stats.facsFromHtml++;
      // DBと食い違う項目だけSQLを出す
      const diffs = FACILITIES
        .filter(f => facts[f.key] !== null && facts[f.key] !== park[f.key])
        .map(f => `${f.key} = ${facts[f.key]}`);
      if (diffs.length) {
        sqlLines.push(`update parks set ${diffs.join(', ')} where id = ${id};  -- ${park.name}`);
      }
    }

    // 中身が無いページは noindex
    const noindex = photoCount === 0 && about.length === 0;
    if (noindex) stats.noindex++;

    const html = buildHTML(park, { photoCount, points, about, alts, facts, noindex });
    const outPath = path.join(PARKS_DIR, `${id}.html`);

    if (WRITE) {
      fs.writeFileSync(outPath, html, 'utf-8');
      stats.written++;
    }

    rows.push({
      id,
      name: park.name,
      photos: photoCount,
      本文: about.length ? '○' : '－',
      設備元: usedHtml ? 'HTML' : 'DB',
      noindex: noindex ? 'YES' : '',
    });
  }

  // 一覧表示
  hr();
  log('');
  console.table(rows);

  // sync-db.sql
  hr();
  if (sqlLines.length) {
    const sqlPath = path.join(ROOT, 'sync-db.sql');
    const header = [
      '-- HTMLに書かれていた設備情報をSupabaseへ書き戻すSQL',
      '-- rebuild-all.js が自動生成',
      '-- 実行前に必ずバックアップを取ること:',
      "--   create table parks_backup_" + new Date().toISOString().slice(0,10).replace(/-/g,'') + ' as select * from parks;',
      '',
    ].join('\n');
    if (WRITE) {
      fs.writeFileSync(sqlPath, header + sqlLines.join('\n') + '\n', 'utf-8');
      log(`\n📄 sync-db.sql を出力しました（${sqlLines.length} 件のUPDATE）`);
    } else {
      log(`\n📄 sync-db.sql は ${sqlLines.length} 件のUPDATEになります（--write で出力）`);
      log('   プレビュー:');
      sqlLines.slice(0, 5).forEach(l => log('     ' + l));
      if (sqlLines.length > 5) log(`     ... 他 ${sqlLines.length - 5} 件`);
    }
  } else {
    log('\n📄 HTMLとDBの設備情報に差分はありませんでした。');
  }

  // サマリー
  hr();
  log('\n📊 サマリー');
  log(`   総ページ数            : ${stats.total}`);
  log(`   写真あり              : ${stats.withPhotos}`);
  log(`   手書き本文を救出      : ${stats.rescued}`);
  log(`   設備をHTMLから採用    : ${stats.facsFromHtml}`);
  log(`   noindex を付与        : ${stats.noindex}`);
  log(`   書き出したファイル    : ${WRITE ? stats.written : 0}`);
  log('');

  if (!WRITE) {
    log('⚠️  ドライランです。ファイルは変更していません。');
    log('    問題なければ  node rebuild-all.js --write  を実行してください。\n');
  } else {
    log('✅ 完了。次の手順でデプロイしてください:');
    log('     git add .');
    log('     git commit -m "Rebuild all park pages: 3-state facilities, GA4, www canonical, noindex"');
    log('     git push');
    log('');
    log('   その後 sync-db.sql をSupabaseのSQL Editorに貼って実行してください。\n');
  }
}

main().catch(err => {
  console.error(`\n❌ エラー: ${err.message}\n`);
  process.exit(1);
});