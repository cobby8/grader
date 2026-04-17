use std::path::Path;
use std::fs;

fn main() {
    // config.json이 없으면 빈 {} 로 자동 생성 (Tauri 리소스 빌드 에러 방지)
    // 실제 config는 런타임에 Rust 코드가 덮어쓴다.
    let config_path = Path::new("../illustrator-scripts/config.json");
    if !config_path.exists() {
        fs::write(config_path, "{}").expect("config.json 자동 생성 실패");
        println!("cargo:warning=config.json not found, created empty placeholder");
    }

    tauri_build::build()
}
