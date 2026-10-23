use assert_cmd::Command;
use predicates::prelude::*;
use std::io::Write;

fn ddalab() -> Command {
    assert_cmd::cargo::cargo_bin_cmd!("ddalab")
}

fn write_ascii_fixture() -> tempfile::NamedTempFile {
    let mut file = tempfile::Builder::new()
        .suffix(".ascii")
        .tempfile()
        .unwrap();
    for t in 0..256 {
        let x = (t as f64 * 0.05).sin();
        let y = 0.6 * x + (t as f64 * 0.07).cos() * 0.1;
        writeln!(file, "{x:.12} {y:.12}").unwrap();
    }
    file
}

// =============================================================================
// GENERAL
// =============================================================================

#[test]
fn test_no_args_shows_help() {
    ddalab()
        .assert()
        .failure()
        .stderr(predicate::str::contains("Usage:"));
}

#[test]
fn test_version_flag() {
    ddalab()
        .arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains("ddalab"));
}

#[test]
fn test_help_flag() {
    ddalab()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("DDA analysis"));
}

// =============================================================================
// VARIANTS SUBCOMMAND
// =============================================================================

#[test]
fn test_variants_subcommand() {
    ddalab()
        .arg("variants")
        .assert()
        .success()
        .stdout(predicate::str::contains("ST"))
        .stdout(predicate::str::contains("CT"))
        .stdout(predicate::str::contains("CD"))
        .stdout(predicate::str::contains("DE"))
        .stdout(predicate::str::contains("SY"));
}

#[test]
fn test_variants_table_excludes_reserved_row() {
    // The table rows should not contain RESERVED as a variant,
    // though the footer may mention it in the SELECT mask format.
    let output = ddalab().arg("variants").arg("--json").assert().success();

    let stdout = String::from_utf8(output.get_output().stdout.clone()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    let arr = parsed.as_array().unwrap();
    let abbrevs: Vec<&str> = arr
        .iter()
        .map(|v| v.get("abbreviation").unwrap().as_str().unwrap())
        .collect();
    assert!(!abbrevs.contains(&"RESERVED"));
}

#[test]
fn test_variants_json() {
    let output = ddalab().arg("variants").arg("--json").assert().success();

    let stdout = String::from_utf8(output.get_output().stdout.clone()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert!(parsed.is_array());
    let arr = parsed.as_array().unwrap();
    assert_eq!(arr.len(), 5); // 5 active variants (no RESERVED)
}

// =============================================================================
// INFO SUBCOMMAND
// =============================================================================

#[test]
fn test_info_subcommand() {
    ddalab()
        .arg("info")
        .assert()
        .success()
        .stdout(predicate::str::contains("ddalab CLI v"))
        .stdout(predicate::str::contains("Platform:"));
}

#[test]
fn test_info_json() {
    let output = ddalab().arg("info").arg("--json").assert().success();

    let stdout = String::from_utf8(output.get_output().stdout.clone()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert!(parsed.is_object());
    assert!(parsed.get("cli_version").is_some());
    assert!(parsed.get("platform").is_some());
    assert!(parsed.get("arch").is_some());
    assert_eq!(
        parsed
            .get("native_binary_enabled")
            .and_then(|value| value.as_bool()),
        Some(false)
    );
}

// =============================================================================
// VALIDATE SUBCOMMAND
// =============================================================================

#[test]
fn test_validate_nonexistent_file() {
    ddalab()
        .arg("validate")
        .arg("--file")
        .arg("/nonexistent/file.edf")
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("not found"));
}

#[test]
fn test_validate_unsupported_extension() {
    let tmp = tempfile::Builder::new().suffix(".xyz").tempfile().unwrap();

    ddalab()
        .arg("validate")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("Unsupported"));
}

#[test]
fn test_validate_valid_edf_file() {
    let tmp = tempfile::Builder::new().suffix(".edf").tempfile().unwrap();

    ddalab()
        .arg("validate")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .assert()
        .success()
        .stdout(predicate::str::contains("valid"));
}

#[test]
fn test_validate_valid_ascii_file() {
    let tmp = tempfile::Builder::new().suffix(".txt").tempfile().unwrap();

    ddalab()
        .arg("validate")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .assert()
        .success();
}

#[test]
fn test_validate_json_output() {
    let tmp = tempfile::Builder::new().suffix(".edf").tempfile().unwrap();

    let output = ddalab()
        .arg("validate")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .arg("--json")
        .assert()
        .success();

    let stdout = String::from_utf8(output.get_output().stdout.clone()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed.get("exists").unwrap(), true);
    assert_eq!(parsed.get("supported").unwrap(), true);
}

// =============================================================================
// RUN SUBCOMMAND — ARGUMENT VALIDATION
// =============================================================================

#[test]
fn test_run_missing_file_arg() {
    ddalab()
        .arg("run")
        .arg("--channels")
        .arg("0")
        .assert()
        .failure()
        .stderr(predicate::str::contains("--file"));
}

#[test]
fn test_run_missing_channels_arg() {
    let tmp = tempfile::Builder::new().suffix(".edf").tempfile().unwrap();

    ddalab()
        .arg("run")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .assert()
        .failure()
        .stderr(predicate::str::contains("channel"));
}

#[test]
fn test_run_nonexistent_file() {
    ddalab()
        .arg("run")
        .arg("--file")
        .arg("/nonexistent/file.edf")
        .arg("--channels")
        .arg("0")
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("not found"));
}

#[test]
fn test_run_ascii_uses_pure_rust_backend() {
    let ascii = write_ascii_fixture();

    let output = ddalab()
        .env_remove("DDA_BINARY_PATH")
        .arg("run")
        .arg("--file")
        .arg(ascii.path().to_str().unwrap())
        .arg("--channels")
        .arg("0")
        .arg("1")
        .arg("--variants")
        .arg("ST")
        .arg("--wl")
        .arg("64")
        .arg("--ws")
        .arg("32")
        .arg("--delays")
        .arg("1")
        .arg("2")
        .assert()
        .success();

    let stderr = String::from_utf8(output.get_output().stderr.clone()).unwrap();
    assert!(stderr.contains("Backend: pure-rust"));

    let stdout = String::from_utf8(output.get_output().stdout.clone()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert!(parsed.get("variant_results").is_some());
}

#[test]
fn test_run_invalid_variant() {
    let tmp = tempfile::Builder::new().suffix(".edf").tempfile().unwrap();

    ddalab()
        .arg("run")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .arg("--channels")
        .arg("0")
        .arg("--variants")
        .arg("INVALID")
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("Unknown variant"));
}

#[test]
fn test_run_ct_one_channel_without_pairs_rejected() {
    let tmp = tempfile::Builder::new().suffix(".edf").tempfile().unwrap();

    ddalab()
        .arg("run")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .arg("--channels")
        .arg("0")
        .arg("--variants")
        .arg("CT")
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("--ct-pairs"));
}

#[test]
fn test_run_cd_without_pairs() {
    let tmp = tempfile::Builder::new().suffix(".edf").tempfile().unwrap();

    ddalab()
        .arg("run")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .arg("--channels")
        .arg("0")
        .arg("1")
        .arg("--variants")
        .arg("CD")
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("--cd-pairs"));
}

#[test]
fn test_run_unsupported_file_extension() {
    let tmp = tempfile::Builder::new().suffix(".xyz").tempfile().unwrap();

    ddalab()
        .arg("run")
        .arg("--file")
        .arg(tmp.path().to_str().unwrap())
        .arg("--channels")
        .arg("0")
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("Unsupported"));
}

// Project-local pooled input validation regression tests. Production solver unchanged.
#[test]
fn test_run_ct_pooled_three_columns_one_group() {
    let mut file = tempfile::Builder::new().suffix(".txt").tempfile().unwrap();
    for t in 0..250 {
        let tt = t as f64;
        let x = (tt * 0.05).sin() + 0.2 * (tt * 0.11).cos();
        let y = (tt * 0.07 + 0.3).sin() + 0.1 * (tt * 0.17).cos();
        let z = (tt * 0.09 + 0.5).cos() + 0.3 * (tt * 0.03).sin();
        writeln!(file, "{x:.14} {y:.14} {z:.14}").unwrap();
    }
    let output = ddalab()
        .args(["run", "--file", file.path().to_str().unwrap(),
            "--channels", "0", "1", "2", "--variants", "CT",
            "--wl", "50", "--ws", "10", "--ct-wl", "3", "--ct-ws", "3",
            "--delays", "7", "10", "--model", "1", "2", "10",
            "--dm", "4", "--order", "4", "--nr-tau", "2", "--sr", "250",
            "--start-sample", "0", "--end-sample", "249", "--quiet"])
        .assert().success();
    let result: serde_json::Value =
        serde_json::from_slice(&output.get_output().stdout).unwrap();
    let variants = result["variant_results"].as_array().unwrap();
    assert_eq!(variants.len(), 1);
    assert_eq!(variants[0]["variant_id"], "CT");
    let rows = variants[0]["q_matrix"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    let values = rows[0].as_array().unwrap();
    assert_eq!(values.len(), 19);
    assert!(values.iter().all(|v| v.as_f64().is_some_and(f64::is_finite)));
    let labels = variants[0]["channel_labels"].as_array().unwrap();
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0], "Ch 0&Ch 1&Ch 2");
    let markers = variants[0]["error_values"].as_array().unwrap();
    assert_eq!(markers.len(), 19);
    assert_eq!(markers[0].as_f64(), Some(68.0));
    assert_eq!(markers[18].as_f64(), Some(248.0));
}

#[test]
fn test_run_ct_duplicate_only_channels_rejected() {
    let file = write_ascii_fixture();
    ddalab().args(["run", "--file", file.path().to_str().unwrap(),
        "--channels", "0", "0", "--variants", "CT"])
        .assert().failure().code(1)
        .stderr(predicate::str::contains("two distinct selected channels"));
}

#[test]
fn test_run_ct_explicit_pair_remains_supported() {
    let file = write_ascii_fixture();
    let output = ddalab().args(["run", "--file", file.path().to_str().unwrap(),
        "--channels", "0", "1", "--variants", "CT", "--ct-pairs", "0,1",
        "--wl", "50", "--ws", "10", "--delays", "7", "10", "--quiet"])
        .assert().success();
    let result: serde_json::Value =
        serde_json::from_slice(&output.get_output().stdout).unwrap();
    let rows = result["variant_results"][0]["q_matrix"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0].as_array().unwrap().iter()
        .all(|v| v.as_f64().is_some_and(f64::is_finite)));
}
