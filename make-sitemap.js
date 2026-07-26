#!/usr/bin/env node
/**
 * make-sitemap.js
 * 戸田市公園ガイド - sitemap.xml 生成スクリプト
 *
 * 【使い方】
 *   node make-sitemap.js          … ドライラン（中身を表示するだけ）
 *   node make-sitemap.js --write  … sitemap.xml を書き出す
 *
 * 【置き場所】
 *   C:\Users\hsasa\Downloads\koengide-fresh\make-sitemap.js  （リポジトリのルート）
 *
 * 【考え方】
 *   parks/*.html を1枚ずつ読み、<meta name="robots" content="noindex..."> が
 *   入っているページを除外する。
 *   rebuild-all-v2.js の判定結果をそのまま使うので、noindex と sitemap が
 *   ズレることが構造的に起きない。
 *
 * 【前提】
 *   rebuild-all-v2.js --write を実行したあとに走らせること。
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SITE_BASE = 'https://www.koengide.com';
const ROOT      = process.cwd();
const PARKS_DIR = path.join(ROOT, 'parks');
const OUT_PATH  = path.join(ROOT, 'sitemap.xml');
const WRITE     = process.argv.includes('--write');

/** 静的に載せたい固定ページ（今後 privacy.html などを足す場所） */
const STATIC_PAGES = [
  { loc: `${SITE_BASE}/`, file: path.join(ROOT, 'index.html') },
  // { loc: `${SITE_BASE}/privacy.html`,  file: path.join(ROOT, 'privacy.html') },
  // { loc: `${SITE_BASE}/about.html`,    file: path.join(ROOT, 'about.html') },
  // { loc: `${SITE_BASE}/contact.html`,  file: path.join(ROOT, 'contact.html') },
];

function lastmodOf(file) {
  try {
    return fs.statSync(file).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function isNoindex(html) {
  return /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
}

function main() {
  console.log('\n🗺  sitemap.xml 生成');
  console.log(WRITE ? '   モード: 書き込み (--write)' : '   モード: ドライラン（--write を付けると書き出します）');
  console.log('─'.repeat(60));

  if (!fs.existsSync(PARKS_DIR)) {
    throw new Error(`parks/ が見つかりません。リポジトリのルートで実行してください（現在: ${ROOT}）`);
  }

  const entries = [];

  // ① 固定ページ
  for (const p of STATIC_PAGES) {
    if (!fs.existsSync(p.file)) {
      console.log(`   ⚠️  ${path.basename(p.file)} が無いのでスキップ`);
      continue;
    }
    entries.push({ loc: p.loc, lastmod: lastmodOf(p.file) });
  }

  // ② 公園ページ（noindex を除外）
  const files = fs.readdirSync(PARKS_DIR)
    .filter(f => /^\d+\.html$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  let skipped = 0;
  for (const f of files) {
    const full = path.join(PARKS_DIR, f);
    const html = fs.readFileSync(full, 'utf-8');
    if (isNoindex(html)) { skipped++; continue; }
    entries.push({ loc: `${SITE_BASE}/parks/${f}`, lastmod: lastmodOf(full) });
  }

  // ③ XML組み立て
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>
`;

  console.log(`\n   公園ページ総数   : ${files.length}`);
  console.log(`   noindexで除外    : ${skipped}`);
  console.log(`   sitemapに載る数  : ${entries.length}（固定ページ含む）`);

  if (WRITE) {
    fs.writeFileSync(OUT_PATH, xml, 'utf-8');
    console.log(`\n✅ sitemap.xml を書き出しました（${entries.length} URL）`);
    console.log('\n   次の手順で反映してください:');
    console.log('     git add sitemap.xml');
    console.log('     git commit -m "Update sitemap: exclude noindex pages"');
    console.log('     git push\n');
  } else {
    console.log('\n   先頭5件のプレビュー:');
    entries.slice(0, 5).forEach(e => console.log(`     ${e.loc}`));
    console.log(`     ... 他 ${Math.max(0, entries.length - 5)} 件`);
    console.log('\n⚠️  ドライランです。ファイルは変更していません。');
    console.log('    問題なければ  node make-sitemap.js --write  を実行してください。\n');
  }
}

try { main(); }
catch (err) { console.error(`\n❌ エラー: ${err.message}\n`); process.exit(1); }