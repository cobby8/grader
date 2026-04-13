// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 지정된 디렉토리 내의 .svg 파일 경로 목록을 반환한다.
/// 프론트에서 폴더를 선택했을 때, 그 폴더 안의 SVG 파일들을 스캔하기 위해 사용.
#[tauri::command]
fn list_svg_files(dir_path: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&dir_path);
    if !path.is_dir() {
        return Err(format!("디렉토리가 아닙니다: {}", dir_path));
    }

    let mut svg_files: Vec<String> = Vec::new();

    // 디렉토리 내 파일 목록을 읽고, .svg 확장자만 필터링
    let entries = std::fs::read_dir(path)
        .map_err(|e| format!("디렉토리 읽기 실패: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("항목 읽기 실패: {}", e))?;
        let file_path = entry.path();

        // 파일이고, 확장자가 .svg인 경우만 추가
        if file_path.is_file() {
            if let Some(ext) = file_path.extension() {
                if ext.to_string_lossy().to_lowercase() == "svg" {
                    svg_files.push(file_path.to_string_lossy().to_string());
                }
            }
        }
    }

    // 파일명 기준으로 정렬 (일관된 순서 보장)
    svg_files.sort();

    Ok(svg_files)
}

/// Python 엔진 폴더의 절대 경로를 찾는다.
/// 개발 시에는 프로젝트 루트 기준으로 `python-engine/` 폴더를 찾는다.
/// - tauri 개발 모드: src-tauri의 부모 폴더 = 프로젝트 루트
fn get_python_engine_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 현재 실행 파일의 경로를 기준으로 역추적
    // dev 모드: src-tauri/target/debug/grader.exe → 프로젝트 루트 = 3단계 상위
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("실행 파일 경로를 찾을 수 없습니다: {}", e))?;

    // 개발 모드에서는 src-tauri/target/debug 기준, 3단계 위로
    let mut candidate = exe_path.clone();
    for _ in 0..4 {
        if let Some(parent) = candidate.parent() {
            candidate = parent.to_path_buf();
            let engine = candidate.join("python-engine");
            if engine.exists() {
                return Ok(engine);
            }
        }
    }

    // 폴백: 리소스 디렉토리 확인 (번들 배포용)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let engine = resource_dir.join("python-engine");
        if engine.exists() {
            return Ok(engine);
        }
    }

    Err("python-engine 폴더를 찾을 수 없습니다. 프로젝트 루트에 python-engine 폴더가 있는지 확인하세요.".to_string())
}

/// Python 엔진 스크립트를 subprocess로 실행하고 stdout 출력을 반환한다.
///
/// 인자:
///   - command: 실행할 명령 (예: "get_pdf_info", "verify_cmyk", "generate_preview")
///   - args: 명령에 전달할 인자들 (예: ["C:/path/to/file.pdf"])
///
/// 반환: Python 스크립트가 출력한 JSON 문자열 (성공 시) 또는 에러 메시지
#[tauri::command]
fn run_python(
    app: tauri::AppHandle,
    command: String,
    args: Vec<String>,
) -> Result<String, String> {
    // Python 엔진 디렉토리 찾기
    let engine_dir = get_python_engine_dir(&app)?;

    // venv의 python.exe 경로 (Windows)
    let python_exe = engine_dir.join("venv").join("Scripts").join("python.exe");

    // python 실행 파일이 없으면 에러
    if !python_exe.exists() {
        return Err(format!(
            "Python venv를 찾을 수 없습니다: {:?}. 'cd python-engine && python -m venv venv && venv/Scripts/pip install -r requirements.txt' 명령으로 환경을 구성하세요.",
            python_exe
        ));
    }

    // main.py 스크립트 경로
    let main_script = engine_dir.join("main.py");
    if !main_script.exists() {
        return Err(format!("main.py를 찾을 수 없습니다: {:?}", main_script));
    }

    // Python 스크립트 실행 명령 구성
    // python.exe main.py <command> <arg1> <arg2> ...
    let mut cmd_args: Vec<String> = vec![
        main_script.to_string_lossy().to_string(),
        command,
    ];
    cmd_args.extend(args);

    // subprocess 실행 (작업 디렉토리를 engine_dir로 설정 → pdf_handler import가 가능하도록)
    let output = Command::new(&python_exe)
        .args(&cmd_args)
        .current_dir(&engine_dir)
        .output()
        .map_err(|e| format!("Python 실행 실패: {}", e))?;

    // 표준 출력을 UTF-8 문자열로 변환 (main.py가 UTF-8 출력을 강제함)
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Python 스크립트가 비정상 종료된 경우
    if !output.status.success() {
        // stdout에 JSON 에러가 있을 수 있으므로 그것을 우선 반환
        if !stdout.trim().is_empty() {
            return Ok(stdout);
        }
        return Err(format!("Python 스크립트 실패: {}", stderr));
    }

    Ok(stdout)
}

/// Windows에서 Adobe Illustrator 실행 파일 경로를 찾는다.
/// Program Files 하위의 여러 버전 폴더를 탐색하여 최신 버전을 반환한다.
///
/// 탐색 후보:
///   C:\Program Files\Adobe\Adobe Illustrator 20XX\Support Files\Contents\Windows\Illustrator.exe
///   C:\Program Files\Adobe\Adobe Illustrator CC 20XX\Support Files\Contents\Windows\Illustrator.exe
#[tauri::command]
fn find_illustrator_exe() -> Result<String, String> {
    let adobe_dir = PathBuf::from(r"C:\Program Files\Adobe");

    if !adobe_dir.is_dir() {
        return Err("Adobe 폴더를 찾을 수 없습니다: C:\\Program Files\\Adobe".to_string());
    }

    // Adobe 폴더 내 Illustrator 폴더들을 탐색
    let entries = std::fs::read_dir(&adobe_dir)
        .map_err(|e| format!("Adobe 폴더 읽기 실패: {}", e))?;

    let mut candidates: Vec<(String, PathBuf)> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let folder_name = entry.file_name().to_string_lossy().to_string();

        // "Adobe Illustrator" 로 시작하는 폴더만 대상
        if !folder_name.starts_with("Adobe Illustrator") {
            continue;
        }

        // Illustrator.exe 경로 확인
        let exe_path = entry.path()
            .join("Support Files")
            .join("Contents")
            .join("Windows")
            .join("Illustrator.exe");

        if exe_path.exists() {
            candidates.push((folder_name.clone(), exe_path));
        }
    }

    if candidates.is_empty() {
        return Err(
            "Adobe Illustrator를 찾을 수 없습니다. \
            C:\\Program Files\\Adobe\\ 아래에 Illustrator가 설치되어 있는지 확인하세요."
            .to_string()
        );
    }

    // 폴더명 기준 내림차순 정렬 (최신 버전 우선)
    candidates.sort_by(|a, b| b.0.cmp(&a.0));

    let best = &candidates[0];
    Ok(best.1.to_string_lossy().to_string())
}

/// Illustrator ExtendScript(.jsx)를 실행하고, 결과 마커 파일(result.json)을 폴링하여 완료를 감지한다.
///
/// 인자:
///   - illustrator_exe: Illustrator.exe 절대 경로
///   - script_path: 실행할 .jsx 스크립트 절대 경로
///   - result_json_path: 완료 시 생성될 result.json 경로
///   - timeout_secs: 최대 대기 시간 (초)
///
/// 반환: result.json의 내용 (JSON 문자열)
#[tauri::command]
fn run_illustrator_script(
    illustrator_exe: String,
    script_path: String,
    result_json_path: String,
    timeout_secs: u64,
) -> Result<String, String> {
    // result.json이 이미 존재하면 삭제 (이전 실행 잔여물 정리)
    let result_path = std::path::Path::new(&result_json_path);
    if result_path.exists() {
        let _ = std::fs::remove_file(result_path);
    }

    // Illustrator.exe /run "script.jsx" 형태로 실행
    // Illustrator는 백그라운드에서 스크립트를 실행하고 종료하지 않음
    let _child = Command::new(&illustrator_exe)
        .arg("/run")
        .arg(&script_path)
        .spawn()
        .map_err(|e| format!("Illustrator 실행 실패: {}", e))?;

    // result.json 파일이 생성될 때까지 폴링
    let poll_interval = std::time::Duration::from_millis(500);
    let max_wait = std::time::Duration::from_secs(timeout_secs);
    let start = std::time::Instant::now();

    loop {
        // 타임아웃 체크
        if start.elapsed() > max_wait {
            return Err(format!(
                "Illustrator 스크립트 실행 시간 초과 ({}초). \
                Illustrator가 정상적으로 설치되어 있는지, 스크립트에 오류가 없는지 확인하세요.",
                timeout_secs
            ));
        }

        // result.json 존재 여부 확인
        if result_path.exists() {
            // 파일이 완전히 쓰여졌는지 확인하기 위해 잠시 대기
            std::thread::sleep(std::time::Duration::from_millis(200));

            // 파일 읽기
            let content = std::fs::read_to_string(result_path)
                .map_err(|e| format!("result.json 읽기 실패: {}", e))?;

            // 정리: result.json 삭제
            let _ = std::fs::remove_file(result_path);

            return Ok(content);
        }

        std::thread::sleep(poll_interval);
    }
}

/// illustrator-scripts/ 폴더의 절대 경로를 찾는다.
/// 개발 모드: 프로젝트 루트/illustrator-scripts/
/// 프로덕션: 리소스 디렉토리/illustrator-scripts/
fn get_illustrator_scripts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 실행 파일 경로에서 역추적하여 프로젝트 루트 탐색
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("실행 파일 경로를 찾을 수 없습니다: {}", e))?;

    let mut candidate = exe_path.clone();
    for _ in 0..4 {
        if let Some(parent) = candidate.parent() {
            candidate = parent.to_path_buf();
            let scripts_dir = candidate.join("illustrator-scripts");
            if scripts_dir.exists() {
                return Ok(scripts_dir);
            }
        }
    }

    // 폴백: 리소스 디렉토리 확인 (번들 배포용)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let scripts_dir = resource_dir.join("illustrator-scripts");
        if scripts_dir.exists() {
            return Ok(scripts_dir);
        }
    }

    Err("illustrator-scripts 폴더를 찾을 수 없습니다.".to_string())
}

/// illustrator-scripts/ 폴더의 절대 경로를 반환한다 (프론트에서 config.json 생성 시 필요).
#[tauri::command]
fn get_illustrator_scripts_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = get_illustrator_scripts_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

/// 절대 경로에 텍스트 파일을 쓴다.
/// Tauri fs 플러그인의 권한 제한을 우회하여, 임의의 절대 경로에 파일을 쓸 수 있다.
/// 주 용도: illustrator-scripts/ 폴더에 config.json, 임시 SVG 등을 저장할 때.
#[tauri::command]
fn write_file_absolute(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("파일 쓰기 실패: {}", e))
}

/// 절대 경로에서 텍스트 파일을 읽는다.
/// Tauri fs 플러그인의 권한 제한을 우회하여, 임의의 절대 경로에서 파일을 읽을 수 있다.
#[tauri::command]
fn read_file_absolute(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("파일 읽기 실패: {}", e))
}

/// 절대 경로의 파일을 삭제한다.
/// Tauri fs 플러그인의 권한 제한을 우회하여, 임의의 절대 경로의 파일을 삭제할 수 있다.
#[tauri::command]
fn remove_file_absolute(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("파일 삭제 실패: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())  // 파일 선택 다이얼로그
        .plugin(tauri_plugin_fs::init())      // 파일 읽기/쓰기
        .invoke_handler(tauri::generate_handler![
            greet,
            run_python,
            list_svg_files,
            find_illustrator_exe,
            run_illustrator_script,
            get_illustrator_scripts_path,
            write_file_absolute,
            read_file_absolute,
            remove_file_absolute
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
