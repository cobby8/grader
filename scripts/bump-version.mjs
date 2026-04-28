#!/usr/bin/env node
/**
 * bump-version.mjs — 3파일 버전 동기화 스크립트
 *
 * [왜 필요한가]
 *   grader는 버전을 3곳(package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json)에
 *   각각 보관한다. 사람이 하나라도 까먹으면 빌드는 돼도 업데이트 매니페스트와 실제 앱 버전이
 *   불일치해 업데이트 체크가 엉킨다. 이 스크립트 한 번 실행으로 3곳을 원자적으로 갱신한다.
 *
 * [사용법]
 *   node scripts/bump-version.mjs 1.1.0
 *   npm run release:bump 1.1.0
 *
 * [설계 원칙]
 *   - 원본 포맷(개행, 배열 인라인, 주석, 공백)을 **절대 건드리지 않음**
 *   - 구현: 파일을 문자열로 읽고, version 필드에 해당하는 "단 한 줄"만 정규식으로 교체
 *   - JSON.parse → JSON.stringify로 재직렬화하면 배열 포맷이 펼쳐지므로 사용하지 않음
 *
 * [동작 순서]
 *   1. 인자(semver) 검증
 *   2. 3파일 읽기 + 현재 버전 추출 (모두 성공해야 다음으로)
 *   3. 현재 = 새 버전이면 건너뛰기 (불필요한 변경 방지)
 *   4. 3파일 모두 쓰기 (단일 라인 정규식 교체)
 *   5. 변경 내역(이전 → 이후) 콘솔 출력
 *
 * [주의]
 *   - 이 스크립트는 파일만 수정한다. git commit/tag는 하지 않음.
 *   - rollback이 필요하면 동일 명령으로 이전 버전 값을 다시 넣으면 된다.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 프로젝트 루트 (scripts/의 상위)
const PROJECT_ROOT = resolve(__dirname, '..');

// 대상 파일 경로
const PKG_JSON_PATH = resolve(PROJECT_ROOT, 'package.json');
const CARGO_TOML_PATH = resolve(PROJECT_ROOT, 'src-tauri', 'Cargo.toml');
const TAURI_CONF_PATH = resolve(PROJECT_ROOT, 'src-tauri', 'tauri.conf.json');

/**
 * semver 검증
 * - 기본: x.y.z (모두 숫자)
 * - 허용: x.y.z-beta, x.y.z-rc.1, x.y.z-beta.2 등 (pre-release)
 * - 거부: 공백, 빌드 메타데이터(+build), 잘못된 형식
 */
function validateSemver(version) {
  const re = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  if (!re.test(version)) {
    throw new Error(
      `잘못된 버전 형식: "${version}"\n` +
      `  올바른 예: 1.0.0, 1.2.3, 1.0.0-beta, 1.0.0-rc.1`
    );
  }
}

// ────────────────────────────────────────────────────────────────
// package.json: 최상위 "version": "x.y.z" 한 줄만 교체
// ────────────────────────────────────────────────────────────────

// 정규식 설명:
//   파일 앞부분(첫 "{" 이후 다른 중첩 object 이전)에 나타나는 "version": "..." 패턴.
//   실제 package.json은 name 바로 뒤에 version이 오는 표준 구조라서 최상위 첫 매치가 곧 목표.
//   m 플래그로 ^ 사용하되, 단순하게 전체 텍스트에서 첫 매치만 사용.
const PKG_VERSION_RE = /("version"\s*:\s*)"([^"]+)"/;

function readPkgVersion() {
  const raw = readFileSync(PKG_JSON_PATH, 'utf-8');
  const m = raw.match(PKG_VERSION_RE);
  if (!m) {
    throw new Error(`package.json에서 "version" 필드를 찾을 수 없음`);
  }
  return { raw, currentVersion: m[2] };
}

function writePkgVersion(raw, newVersion) {
  // replace는 첫 매치만 교체 (전역 플래그 없음) → 최상위 version만 안전하게 교체
  const updated = raw.replace(PKG_VERSION_RE, (_full, prefix) => `${prefix}"${newVersion}"`);
  writeFileSync(PKG_JSON_PATH, updated, 'utf-8');
}

// ────────────────────────────────────────────────────────────────
// Cargo.toml: [package] 섹션 안의 version = "x.y.z"만 교체
// ────────────────────────────────────────────────────────────────
//   다른 섹션([build-dependencies], [dependencies] 등)의 version은 절대 건드리지 않음.
//   구현: 행 단위로 읽으며 현재 섹션 추적 → [package] 섹션의 첫 version 행만 교체.
function readCargoVersion() {
  const raw = readFileSync(CARGO_TOML_PATH, 'utf-8');
  // 왜 /\r?\n/ 인가: Windows에서 만든 Cargo.toml 은 CRLF 라인 종결이라
  // split('\n') 만 쓰면 라인 끝에 \r 이 남는다. 그 상태에선 아래 version 매칭의
  // (.*)$ 정규식이 \r 을 line terminator 로 보고 매칭 실패한다 (ECMAScript 사양).
  // /\r?\n/ 로 split 하면 \r 까지 자동 제거되어 정규식이 정상 동작한다.
  const lines = raw.split(/\r?\n/);
  let currentSection = '';
  let versionLineIdx = -1;
  let currentVersion = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 섹션 헤더 매칭: [xxx]
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    // [package] 섹션에서 version = "..." 찾기
    if (currentSection === 'package') {
      const versionMatch = line.match(/^(\s*version\s*=\s*)"([^"]+)"(.*)$/);
      if (versionMatch) {
        versionLineIdx = i;
        currentVersion = versionMatch[2];
        break; // [package]의 첫 version만 사용
      }
    }
  }

  if (versionLineIdx === -1) {
    throw new Error(`Cargo.toml의 [package] 섹션에서 version 필드를 찾을 수 없음`);
  }

  return { raw, lines, versionLineIdx, currentVersion };
}

function writeCargoVersion(lines, versionLineIdx, newVersion) {
  // 해당 행에서 따옴표 안 값만 정교하게 교체 (들여쓰기/주석 보존)
  const original = lines[versionLineIdx];
  const replaced = original.replace(
    /^(\s*version\s*=\s*)"[^"]+"(.*)$/,
    `$1"${newVersion}"$2`
  );
  lines[versionLineIdx] = replaced;
  writeFileSync(CARGO_TOML_PATH, lines.join('\n'), 'utf-8');
}

// ────────────────────────────────────────────────────────────────
// tauri.conf.json: 최상위 "version": "x.y.z"만 교체
// ────────────────────────────────────────────────────────────────
//   JSON.parse + JSON.stringify는 배열(예: ["msi","nsis"])을 펼쳐서 저장하므로
//   원본 포맷 보존 목적으로 정규식 단일 라인 교체 사용.
const TAURI_VERSION_RE = /("version"\s*:\s*)"([^"]+)"/;

function readTauriConfVersion() {
  const raw = readFileSync(TAURI_CONF_PATH, 'utf-8');
  const m = raw.match(TAURI_VERSION_RE);
  if (!m) {
    throw new Error(`tauri.conf.json에서 "version" 필드를 찾을 수 없음`);
  }
  return { raw, currentVersion: m[2] };
}

function writeTauriConfVersion(raw, newVersion) {
  // 첫 매치만 교체 (plugins.updater 안에는 version 필드 없음, 안전)
  const updated = raw.replace(TAURI_VERSION_RE, (_full, prefix) => `${prefix}"${newVersion}"`);
  writeFileSync(TAURI_CONF_PATH, updated, 'utf-8');
}

// ────────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────────
function main() {
  // 1. 인자 검증
  const newVersion = process.argv[2];
  if (!newVersion) {
    console.error('❌ 사용법: node scripts/bump-version.mjs <버전>');
    console.error('   예: node scripts/bump-version.mjs 1.1.0');
    process.exit(1);
  }
  try {
    validateSemver(newVersion);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // 2. 3파일 읽기 + 현재 버전 추출 (모두 성공해야 다음 단계로)
  console.log('🔍 3파일 읽기 및 파싱 중...');
  let pkg, cargo, tauri;
  try {
    pkg = readPkgVersion();
    cargo = readCargoVersion();
    tauri = readTauriConfVersion();
  } catch (err) {
    console.error(`❌ 파일 읽기/파싱 실패: ${err.message}`);
    console.error('   어떤 파일도 수정되지 않음. 원인 해결 후 재시도.');
    process.exit(1);
  }

  // 3. 이미 모든 파일이 새 버전과 같으면 변경 스킵
  const allSame =
    pkg.currentVersion === newVersion &&
    cargo.currentVersion === newVersion &&
    tauri.currentVersion === newVersion;
  if (allSame) {
    console.log(`ℹ️  이미 모든 파일이 ${newVersion} 버전임. 변경 없음.`);
    return;
  }

  // 4. 쓰기 (package.json → Cargo.toml → tauri.conf.json 순서)
  console.log('✏️  버전 갱신 중...');
  writePkgVersion(pkg.raw, newVersion);
  writeCargoVersion(cargo.lines, cargo.versionLineIdx, newVersion);
  writeTauriConfVersion(tauri.raw, newVersion);

  // 5. 변경 내역 출력
  console.log('');
  console.log('✅ 버전 동기화 완료');
  console.log('─'.repeat(60));
  console.log(`  package.json         : ${pkg.currentVersion}  →  ${newVersion}`);
  console.log(`  src-tauri/Cargo.toml : ${cargo.currentVersion}  →  ${newVersion}`);
  console.log(`  src-tauri/tauri.conf : ${tauri.currentVersion}  →  ${newVersion}`);
  console.log('─'.repeat(60));
  console.log('');
  console.log('💡 다음 단계 (필요 시):');
  console.log('   git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json');
  console.log(`   git commit -m "chore: bump version to ${newVersion}"`);
  console.log(`   git tag v${newVersion}`);
  console.log('   git push && git push --tags');
}

main();
