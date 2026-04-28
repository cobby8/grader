/// <reference types="vite/client" />

// vite.config.ts의 define 옵션으로 빌드 타임에 주입되는 상수.
// 왜 declare const: 일반 변수처럼 import 없이 바로 쓰지만, TS는 그 존재를 모르므로 알려줘야 함.
// 실제 값은 vite build가 package.json의 version을 읽어 리터럴 문자열로 치환한다.
declare const __APP_VERSION__: string;
