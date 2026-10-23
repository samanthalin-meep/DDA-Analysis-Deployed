#[path = "vendor/engine/mod.rs"]
pub mod engine;
#[path = "vendor/error.rs"]
pub mod error;
#[path = "vendor/types.rs"]
pub mod types;

use wasm_bindgen::prelude::*;

/// The desktop engine receives the same request and f64 matrix in the browser.
#[wasm_bindgen]
pub fn run_dda(request_json: &str, samples: &[f64], rows: usize, cols: usize,
               labels_json: &str, progress: &js_sys_function::Callback) -> Result<String, JsValue> {
    let request: types::DDARequest = serde_json::from_str(request_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let labels: Vec<String> = serde_json::from_str(labels_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    if rows == 0 || cols == 0 || samples.len() != rows * cols || labels.len() != cols {
        return Err(JsValue::from_str("Invalid analysis matrix dimensions."));
    }
    let matrix: Vec<Vec<f64>> = samples.chunks_exact(cols).map(|r| r.to_vec()).collect();
    let runner = engine::PureRustRunner::default();
    let result = runner.run_on_matrix_with_progress(&request, &matrix, Some(&labels), |p| {
        progress.report(&serde_json::to_string(p).unwrap_or_default());
    }).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

mod js_sys_function {
    use wasm_bindgen::prelude::*;
    #[wasm_bindgen]
    extern "C" {
        pub type Callback;
        #[wasm_bindgen(method, catch, js_name = call)]
        fn call(this: &Callback, context: &JsValue, value: &str) -> Result<JsValue, JsValue>;
    }
    impl Callback {
        pub fn report(&self, s: &str) { let _ = self.call(&JsValue::NULL, s); }
    }
}
