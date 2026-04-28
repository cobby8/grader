import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// 왜 fs/path import: package.json 의 version 필드를 빌드 타임에 읽어
// 프론트 코드 안의 __APP_VERSION__ 자리에 박아넣기 위함.
// 이 방식이 아니면 코드에 "0.1.0" 같은 옛날 문자열이 그대로 남아 배포된다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// 왜 ESM에서 __dirname 직접 안 쓰나: vite.config.ts가 ESM 모드라 __dirname 미정의.
// import.meta.url 에서 현재 파일의 디렉터리를 직접 계산해야 함.
const __dirname = dirname(fileURLToPath(import.meta.url));

// 빌드 타임에 package.json의 version을 읽어 상수로 주입한다.
// 결과: 소스의 __APP_VERSION__ 토큰이 vite build 단계에서 "1.0.0" 같은 실제 문자열로 치환됨.
const pkgJson = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8")
) as { version: string };
const APP_VERSION = pkgJson.version;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // 빌드 타임 상수 주입: 프론트 코드가 __APP_VERSION__ 라고 쓰면
  // 번들러가 자동으로 "1.0.0" 같은 리터럴 문자열로 교체한다.
  // JSON.stringify로 감싸야 코드에 들어갈 때 따옴표가 붙는다 (define 규칙).
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
