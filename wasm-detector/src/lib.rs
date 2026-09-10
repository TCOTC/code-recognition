use std::fmt::Write;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn detect_scores(source: &str) -> String {
    let detection = betlang::detect(source.as_bytes());
    let mut output = String::new();
    for (score, language) in detection.top_languages() {
        let _ = writeln!(output, "{}:{score}", language.slug());
    }
    output
}
