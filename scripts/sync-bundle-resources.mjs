#!/usr/bin/env node
// ============================================================
// sync-bundle-resources.mjs
// ------------------------------------------------------------
// 왜 이 스크립트가 필요한가?
//   Tauri v2는 번들에 포함할 외부 리소스를
//   `src-tauri/tauri.conf.json`의 `bundle.resources` 객체에
//   하나씩 명시해야 한다. 파이썬 엔진(.py)이나 일러스트레이터
//   스크립트(.jsx)가 새로 추가될 때마다 개발자가 수동으로
//   이 목록을 수정해야 하는데, 까먹으면 **배포판에 최신 파일이
//   누락**되어 런타임에 "파일 없음" 에러가 난다.
//
//   이 스크립트는 빌드 전(`npm run prebuild`)에 자동 실행되어
//   - python-engine/*.py + requirements.txt
//   - illustrator-scripts/*.jsx + config.json + README.md
//   를 스캔하여 tauri.conf.json의 bundle.resources를
//   자동으로 갱신한다. 다른 리소스(setup-python.bat 등)는
//   그대로 보존한다.
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 이 파일의 절대 경로 → 프로젝트 루트 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// tauri.conf.json 경로
const CONF_PATH = resolve(ROOT, 'src-tauri', 'tauri.conf.json');

// 스캔 대상 폴더 정의
const PYTHON_DIR = resolve(ROOT, 'python-engine');
const ILLUSTRATOR_DIR = resolve(ROOT, 'illustrator-scripts');

// ------------------------------------------------------------
// 제외 규칙 (프로젝트 컨벤션)
//   - python-engine: __pycache__/, venv/, test_*.py 제외
//   - illustrator-scripts: *-backup.jsx, test/ 폴더 제외
// ------------------------------------------------------------
const PY_EXCLUDE_PATTERNS = [
  /^test_/i,          // test_ 접두사 파일
  /^__/,              // __pycache__, __init__ 등 dunder
];
const JSX_EXCLUDE_PATTERNS = [
  /-backup\.jsx$/i,   // grading-A-backup.jsx 등 백업 파일
  /^test/i,           // test 폴더 (파일/폴더 모두 제외)
];

// ------------------------------------------------------------
// 항상 포함돼야 하는 비-스캔 리소스
//   (setup-python.bat, INSTALL-GUIDE.md)
//   → 이 스크립트는 resources에서 이 두 개는 건드리지 않고 보존한다.
// ------------------------------------------------------------
const PRESERVED_KEYS = [
  '../setup-python.bat',
  '../INSTALL-GUIDE.md',
];

/**
 * 폴더에서 확장자 필터를 통과하는 파일 목록을 반환한다.
 * @param {string} dir 절대 경로
 * @param {RegExp} extRegex 파일 확장자 정규식
 * @param {RegExp[]} excludes 제외 패턴 목록
 * @returns {string[]} 파일명 목록 (정렬됨)
 */
function listFiles(dir, extRegex, excludes) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => extRegex.test(name))
    .filter((name) => !excludes.some((rx) => rx.test(name)))
    .sort();
}

// ------------------------------------------------------------
// 1) 스캔: 대상 파일 수집
// ------------------------------------------------------------
// Python: *.py + requirements.txt (고정 포함)
const pyFiles = listFiles(PYTHON_DIR, /\.py$/i, PY_EXCLUDE_PATTERNS);
if (existsSync(resolve(PYTHON_DIR, 'requirements.txt'))) {
  pyFiles.push('requirements.txt');
}

// Illustrator: *.jsx + config.json + README.md
const jsxFiles = listFiles(ILLUSTRATOR_DIR, /\.jsx$/i, JSX_EXCLUDE_PATTERNS);
const illustratorExtras = [];
if (existsSync(resolve(ILLUSTRATOR_DIR, 'config.json'))) {
  illustratorExtras.push('config.json');
}
if (existsSync(resolve(ILLUSTRATOR_DIR, 'README.md'))) {
  illustratorExtras.push('README.md');
}

// ------------------------------------------------------------
// 2) 새 resources 객체 생성
//   키 형식: `../python-engine/파일명` → 값: `python-engine/파일명`
//   (Tauri는 소스 경로 → 번들 내부 상대 경로를 매핑한다)
// ------------------------------------------------------------
const newResources = {};

// 2-1. python-engine 항목
for (const name of pyFiles) {
  const key = `../python-engine/${name}`;
  const val = `python-engine/${name}`;
  newResources[key] = val;
}

// 2-2. illustrator-scripts 항목
for (const name of [...jsxFiles, ...illustratorExtras]) {
  const key = `../illustrator-scripts/${name}`;
  const val = `illustrator-scripts/${name}`;
  newResources[key] = val;
}

// ------------------------------------------------------------
// 3) 기존 conf 읽어서 보존 키(setup-python.bat 등) 병합
// ------------------------------------------------------------
if (!existsSync(CONF_PATH)) {
  console.error(`[sync-bundle-resources] tauri.conf.json을 찾을 수 없습니다: ${CONF_PATH}`);
  process.exit(1);
}

const confRaw = readFileSync(CONF_PATH, 'utf-8');
const conf = JSON.parse(confRaw);

const oldResources = (conf.bundle && conf.bundle.resources) || {};

// 보존 키는 기존 값 그대로 유지 (값이 없으면 경고)
for (const key of PRESERVED_KEYS) {
  if (oldResources[key]) {
    newResources[key] = oldResources[key];
  } else {
    console.warn(`[sync-bundle-resources] ⚠️ 보존 키 ${key}가 기존 conf에 없습니다. 수동 확인 필요.`);
  }
}

// ------------------------------------------------------------
// 4) 변경 감지: 변화 없으면 파일 쓰지 않음 (멱등성)
// ------------------------------------------------------------
const oldKeys = Object.keys(oldResources).sort();
const newKeys = Object.keys(newResources).sort();

const keysEqual =
  oldKeys.length === newKeys.length &&
  oldKeys.every((k, i) => k === newKeys[i] && oldResources[k] === newResources[k]);

if (keysEqual) {
  console.log(`[sync-bundle-resources] ✅ 변경 없음 (${newKeys.length}개 리소스)`);
  process.exit(0);
}

// ------------------------------------------------------------
// 5) 새 resources 블록 쓰기
//   원본 JSON의 다른 필드는 절대 건드리지 않고,
//   bundle.resources만 교체한다.
// ------------------------------------------------------------
conf.bundle.resources = newResources;

// 2-space 들여쓰기 + 마지막 줄바꿈 (기존 파일 스타일 유지)
const nextRaw = JSON.stringify(conf, null, 2) + '\n';
writeFileSync(CONF_PATH, nextRaw, 'utf-8');

// ------------------------------------------------------------
// 6) 사람이 읽기 좋은 요약 출력
// ------------------------------------------------------------
const added = newKeys.filter((k) => !oldKeys.includes(k));
const removed = oldKeys.filter((k) => !newKeys.includes(k));

console.log(`[sync-bundle-resources] ✅ tauri.conf.json 갱신 완료`);
console.log(`  총 리소스: ${newKeys.length}개`);
if (added.length) console.log(`  추가: ${added.length}개`);
added.forEach((k) => console.log(`    + ${k}`));
if (removed.length) console.log(`  제거: ${removed.length}개`);
removed.forEach((k) => console.log(`    - ${k}`));
