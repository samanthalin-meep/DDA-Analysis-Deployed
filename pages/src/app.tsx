import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Config,
  Dataset,
  Result,
  Variant,
  Preview,
  ElectrodeData,
  defaultConfig,
} from "./types";
import { LinePlot, StackedWaveforms, waveformRows, Heatmap, savePlot, palette } from "./plots";
import { download, save, saved } from "./storage";
import "./style.css";
import { makeSession, type Source } from "./session";
import { readConditions, readElectrodes } from "./recording-input";
import { signalLabel, trialLabel } from "./signal-labels";
import { SignalDetails } from "./signal-details";
import { exportName } from "./export-names";

type Note = { time: string; text: string };
type AnalysisStep = "settings" | "results";
type Ica = {
  name: string;
  channels: string[];
  warnings: string[];
  components: {
    id: number;
    series: number[];
    spatial: number[];
    kurtosis: number;
    variance: number;
    frequencies: number[];
    power: number[];
  }[];
};
type FileOptions = { choices: string[]; reading: boolean; error: string };
const emptyOptions = (): FileOptions => ({
  choices: [],
  reading: false,
  error: "",
});
const nums = (s: string) =>
  s
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);
const csv = (x: unknown) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
const stamp = () => new Date().toLocaleTimeString();

function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          role="tab"
          aria-selected={item === value}
          className={item === value ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function Empty({
  text,
  children,
}: {
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <p>{text}</p>
      {children}
    </div>
  );
}
function resultCSV(result: Result, variant: Variant) {
  const lines = [
    [
      "file",
      "electrode",
      "condition",
      "analysis",
      "included_trials",
      "window_number",
      "time_relative_event_s",
      "measure",
      ["CT", "ST"].includes(variant.id) ? "a1" : "value",
    ].join(","),
  ];
  variant.matrix.forEach((row, i) =>
    row.forEach((value, k) => {
      const g = result.trial_groups[i];
      lines.push(
        [
          result.file_name,
          g?.electrode || "",
          g?.condition || variant.row_labels[i],
          g ? "pooled_cross_trial" : variant.id,
          g?.indices?.length || "",
          k + 1,
          result.window_centers_seconds[k],
          variant.id === "CT" ? "a1" : variant.id,
          value,
        ]
          .map(csv)
          .join(","),
      );
    }),
  );
  return lines.join("\n") + "\n";
}

function App() {
  const [files, setFiles] = useState<Dataset[]>([]),
    [active, setActive] = useState(""),
    [page, setPage] = useState("Overview"),
    [sub, setSub] = useState("DDA");
  const [config, setConfig] = useState<Config>(defaultConfig),
    [expert, setExpert] = useState(false),
    [filePanel, setFilePanel] = useState(false);
  const [analysisFocus, setAnalysisFocus] = useState<{ step: AnalysisStep } | null>(
      null,
    );
  const settingsPanel = useRef<HTMLFieldSetElement>(null),
    settingsScroll = useRef<HTMLDivElement>(null),
    resultsPanel = useRef<HTMLFieldSetElement>(null);
  const [results, setResults] = useState<Result[]>([]),
    [resultId, setResultId] = useState(""),
    [variantId, setVariantId] = useState("CT"),
    [view, setView] = useState("Graph"),
    [scheme, setScheme] = useState("Viridis");
  const [upload, setUpload] = useState(false),
    [uploadFiles, setUploadFiles] = useState<{
      edf?: File;
      txt?: File;
      csv?: File;
    }>({}),
    [recording, setRecording] = useState(""),
    [electrodeSelection, setElectrodeSelection] = useState<string[]>([]),
    [conditionSelection, setConditionSelection] = useState<string[]>([]),
    [average, setAverage] = useState(true);
  const [recordingOptions, setRecordingOptions] = useState({
    edf: emptyOptions(),
    csv: emptyOptions(),
  });
  const recordingInputVersion = useRef({ edf: 0, csv: 0 });
  const electrodes = recordingOptions.edf.choices,
    conditions = recordingOptions.csv.choices;
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Ready"),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [notes, setNotes] = useState<Note[]>([]),
    [remember, setRemember] = useState(
      () => localStorage.getItem("dda-remember") !== "false",
    ),
    [theme, setTheme] = useState(
      () => localStorage.getItem("dda-theme") || "dark",
    );
  const [search, setSearch] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewIndices, setPreviewIndices] = useState<number[]>([0]),
    [previewCondition, setPreviewCondition] = useState(""),
    [previewMode, setPreviewMode] = useState<"single" | "mean" | "separate">("mean"),
    [previewElectrodes, setPreviewElectrodes] = useState<string[]>([]),
    [previewPage, setPreviewPage] = useState(0),
    [previewStart, setPreviewStart] = useState(0),
    [previewEnd, setPreviewEnd] = useState(0.996);
  const [ica, setIca] = useState<Ica | null>(null),
    [icaComponents, setIcaComponents] = useState(5),
    [icaIterations, setIcaIterations] = useState(500),
    [icaTolerance, setIcaTolerance] = useState(0.0001),
    [icaCenter, setIcaCenter] = useState(true),
    [icaWhiten, setIcaWhiten] = useState(true),
    [icaSelected, setIcaSelected] = useState(0),
    [icaView, setIcaView] = useState("Time series");
  const [compareA, setCompareA] = useState(""),
    [compareB, setCompareB] = useState(""),
    [batchFiles, setBatchFiles] = useState<string[]>([]),
    [annotations, setAnnotations] = useState<
      { file: string; time: number; label: string }[]
    >([]),
    [annotationLabel, setAnnotationLabel] = useState(""),
    [annotationTime, setAnnotationTime] = useState(0),
    [pairText, setPairText] = useState("");
  const worker = useRef<Worker | null>(null),
    pending = useRef(
      new Map<
        number,
        { resolve: (v: any) => void; reject: (e: Error) => void }
      >(),
    ),
    sequence = useRef(0),
    sources = useRef(new Map<string, Source>()),
    persistSources = useRef<Source[]>([]),
    openInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  const dataset = files.find((f) => f.id === active),
    previewGroup =
      dataset?.groups.find((g) => g.condition === previewCondition) ||
      dataset?.groups[0],
    result = results.find((r) => r.id === resultId),
    variant =
      result?.variants.find((v) => v.id === variantId) || result?.variants[0];
  function notify(text: string) {
    setNotes((n) => [{ time: stamp(), text }, ...n].slice(0, 100));
  }
  function getWorker() {
    if (!worker.current) {
      const w = new Worker(new URL(__WORKER__, document.baseURI), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (e) => {
        if (e.data.type === "progress") {
          setStatus(e.data.label);
          setProgress(e.data.value);
          return;
        }
        const item = pending.current.get(e.data.id);
        if (item) {
          pending.current.delete(e.data.id);
          e.data.error
            ? item.reject(Error(e.data.error))
            : item.resolve(e.data.result);
        }
      };
      w.onerror = (e) => {
        for (const p of pending.current.values())
          p.reject(Error(e.message || "The analysis worker stopped."));
        pending.current.clear();
      };
    }
    return worker.current;
  }
  function rpc<T = any>(
    action: string,
    payload: any = {},
    transfer: Transferable[] = [],
  ): Promise<T> {
    const id = ++sequence.current;
    return new Promise((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      getWorker().postMessage({ id, action, payload }, transfer);
    });
  }
  function report(e: unknown) {
    const text = errText(e);
    if (text === "Canceled.") return;
    const lines = text.trim().split("\n");
    const brief =
      lines.at(-1)?.replace(/^(ValueError|RuntimeError): /, "") || text;
    setError(brief);
    notify(text);
    setStatus("Stopped");
  }
  async function task<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (busy) return;
    setBusy(true);
    setStatus(label);
    setProgress(0);
    setError("");
    try {
      const value = await fn();
      setStatus("Ready");
      setProgress(1);
      return value;
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  function selectFile(d: Dataset) {
    setActive(d.id);
    setResultId(results.find((r) => r.file_name === d.name)?.id || "");
    setConfig((c) => ({
      ...c,
      start: 0,
      end: (d.rows - 1) / d.rate,
      indices: d.columns.map((_, i) => i),
      variants: d.groups.length ? ["CT"] : c.variants,
      pairs: d.groups.length ? undefined : c.pairs,
    }));
    if (d.groups.length) setPairText("");
    setPreviewIndices(d.groups[0]?.indices || [0]);
    setPreviewCondition(d.groups[0]?.condition || "");
    setPreviewMode(d.groups.length ? "mean" : "single");
    setPreviewElectrodes(d.electrodes || []);
    setPreviewStart(0);
    setPreviewEnd(Math.min((d.rows - 1) / d.rate, 10));
    setPreview(null);
    setSearch("");
  }
  function openAnalysis(step: AnalysisStep) {
    setPage("DDA");
    setSub("DDA");
    setAnalysisFocus({ step });
  }
  useEffect(() => {
    if (!analysisFocus) return;
    const panel =
      analysisFocus.step === "settings"
        ? settingsPanel.current
        : resultsPanel.current;
    if (analysisFocus.step === "settings")
      settingsScroll.current?.scrollTo({ top: 0 });
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: "nearest" });
  }, [analysisFocus]);
  async function persist() {
    persistSources.current = [...sources.current.values()];
    if (remember)
      try {
        await save("files", persistSources.current);
      } catch {
        notify(
          "Browser storage failed. Export a .ddalab session to keep the individual signals.",
        );
      }
  }
  async function addSource(source: Source) {
    const d = await rpc<Dataset>("open", source);
    sources.current.set(d.id, source);
    setFiles((old) => [...old, d]);
    selectFile(d);
    return d;
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dda-theme", theme);
  }, [theme]);
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [storedFiles, storedResults, storedAnnotations] =
          await Promise.all([
            remember ? saved<Source[]>("files") : [],
            saved<Result[]>("results"),
            saved<typeof annotations>("annotations"),
          ]);
        if (disposed) return;
        if (storedResults?.length) {
          setResults(storedResults);
          setResultId(storedResults[0].id);
        }
        if (storedAnnotations) setAnnotations(storedAnnotations);
        if (storedFiles?.length) {
          setBusy(true);
          setStatus("Open saved files");
          for (const source of storedFiles) {
            if (disposed) return;
            await addSource(source);
          }
          persistSources.current = storedFiles;
          const restoredResult = storedResults?.find(
            (r) => r.file_name === storedFiles.at(-1)?.name,
          );
          if (restoredResult) setResultId(restoredResult.id);
          setStatus("Ready");
          setBusy(false);
        }
      } catch (e) {
        report(e);
        setBusy(false);
      }
    })();
    return () => {
      disposed = true;
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    void save("results", results).catch(() => {});
  }, [results]);
  useEffect(() => {
    void save("annotations", annotations).catch(() => {});
  }, [annotations]);
  useEffect(() => {
    if (
      dataset &&
      (page === "Visualize" || page === "Data" || page === "Overview")
    ) {
      let canceled = false;
      setPreview(null);
      setPreviewPage(0);
      // Debounce checkbox changes. The worker queue also serves DDA calculations.
      const timer = setTimeout(() => rpc<Preview>("preview", {
        id: dataset.id,
        config: {
          indices: page === "Visualize"
            ? previewGroup && previewMode !== "single" ? previewIndices : previewIndices.slice(0, 1)
            : previewIndices.length ? previewIndices.slice(0, 12) : [0],
          mode: page === "Visualize" && previewGroup ? previewMode : "separate",
          ...(page === "Visualize" && dataset.electrodes?.length
            ? { electrodes: previewElectrodes } : {}),
          start: previewStart,
          end: previewEnd,
        },
      })
        .then((p) => {
          if (!canceled) setPreview(p);
        })
        .catch((e) => { if (!canceled) report(e); }), 120);
      return () => {
        canceled = true;
        clearTimeout(timer);
      };
    }
  }, [active, page, previewIndices.join(","), previewStart, previewEnd, previewMode, previewElectrodes.join(",")]);
  const change = (key: keyof Config, value: any) =>
    setConfig((c) => ({ ...c, [key]: value }));
  function toggleIndex(i: number) {
    change(
      "indices",
      config.indices.includes(i)
        ? config.indices.filter((n) => n !== i)
        : [...config.indices, i].sort((a, b) => a - b),
    );
  }
  async function cancel() {
    worker.current?.terminate();
    worker.current = null;
    for (const p of pending.current.values()) p.reject(Error("Canceled."));
    pending.current.clear();
    setBusy(false);
    setStatus("Canceled");
    const existing = [...sources.current.values()];
    sources.current.clear();
    setFiles([]);
    setActive("");
    setBusy(true);
    try {
      for (const source of existing) await addSource(source);
      setStatus("Ready");
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function openFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    await task("Open file", async () => {
      for (const file of picked) {
        if (/\.(ddalab|json)$/i.test(file.name)) {
          await importSnapshot(await file.text());
          continue;
        }
        const source = { name: file.name, text: await file.text() };
        await addSource(source);
        notify("Opened " + file.name);
      }
      await persist();
      setPage("DDA");
    });
    if (openInput.current) openInput.current.value = "";
  }
  async function closeFile(d: Dataset) {
    if (busy) return;
    await rpc("close", { id: d.id });
    sources.current.delete(d.id);
    const rest = files.filter((f) => f.id !== d.id);
    setFiles(rest);
    if (active === d.id) {
      if (rest[0]) selectFile(rest[0]);
      else {
        setActive("");
        setPreview(null);
      }
    }
    await persist();
  }
  async function pickRecording(key: "edf" | "txt" | "csv", file?: File) {
    setUploadFiles((s) => ({ ...s, [key]: file }));
    setError("");
    if (key === "txt") return;
    const version = ++recordingInputVersion.current[key];
    if (key === "edf") setElectrodeSelection([]);
    else setConditionSelection([]);
    setRecordingOptions((s) => ({
      ...s,
      [key]: { ...emptyOptions(), reading: !!file },
    }));
    if (!file) return;
    try {
      const choices =
        key === "edf"
          ? await readElectrodes(file)
          : readConditions(await file.text());
      if (recordingInputVersion.current[key] !== version) return;
      if (key === "edf") setElectrodeSelection(choices);
      else setConditionSelection(choices);
      setRecordingOptions((s) => ({
        ...s,
        [key]: { choices, reading: false, error: "" },
      }));
    } catch (e) {
      if (recordingInputVersion.current[key] !== version) return;
      setRecordingOptions((s) => ({
        ...s,
        [key]: { ...emptyOptions(), error: errText(e) },
      }));
    }
  }
  function pickFolder(list: FileList | null) {
    if (!list) return;
    const all = Array.from(list);
    for (const key of ["edf", "txt", "csv"] as const) {
      const matches = all.filter(
        (f) =>
          f.name.toLowerCase().endsWith("." + key) &&
          !/counts|^dda_/i.test(f.name),
      );
      if (matches.length === 1) pickRecording(key, matches[0]);
    }
    setUpload(true);
    if (folderInput.current) folderInput.current.value = "";
  }
  async function prepareRecording(e: React.FormEvent) {
    e.preventDefault();
    const chosen = uploadFiles;
    if (!chosen.edf || !chosen.txt || !chosen.csv) return;
    if (
      !recording ||
      !electrodeSelection.length ||
      !conditionSelection.length ||
      recordingOptions.edf.reading ||
      recordingOptions.csv.reading ||
      recordingOptions.edf.error ||
      recordingOptions.csv.error
    )
      return;
    await task("Prepare recording", async () => {
      const [edf, txt, csv] = await Promise.all([
        chosen.edf!.arrayBuffer(),
        chosen.txt!.arrayBuffer(),
        chosen.csv!.arrayBuffer(),
      ]);
      const outputs = await rpc<Dataset[]>(
        "prepare",
        {
          edf,
          txt,
          csv,
          config: {
            recording,
            electrodes: electrodeSelection,
            conditions: conditionSelection,
            average,
          },
        },
        [edf, txt, csv],
      );
      for (const d of outputs) {
        const text = await rpc<string>("export", { id: d.id });
        const electrodeData = d.electrodes?.length
          ? await rpc<ElectrodeData>("electrodes", { id: d.id }) : undefined;
        sources.current.set(d.id, {
          name: d.name,
          text,
          meta: { counts: d.counts, preparation: d.preparation, electrode_data: electrodeData },
        });
        setFiles((f) => [...f, d]);
        selectFile(d);
      }
      await persist();
      setUpload(false);
      for (const key of ["edf", "txt", "csv"] as const) void pickRecording(key);
      setRecording("");
      setAverage(true);
      setResultId("");
      openAnalysis("settings");
      notify(
        `Prepared ${outputs.length} file${outputs.length === 1 ? "" : "s"}. ${outputs[0].columns.length} trials retained.`,
      );
    });
  }
  async function calculate(d = dataset, c = config) {
    if (!d) throw Error("Open a data file.");
    const pairs = pairText.trim()
      ? pairText.split(";").map((s) => nums(s).map((n) => n - 1))
      : undefined;
    if (
      pairs?.some(
        (p) =>
          p.length !== 2 ||
          p.some((i) => !Number.isInteger(i) || i < 0 || i >= d.columns.length),
      )
    )
      throw Error("Enter pairs as 1,2; 2,3.");
    return rpc<Result>("run", {
      id: d.id,
      name: d.name,
      columns: d.columns,
      preparation: d.preparation,
      config: { ...c, pairs },
    });
  }
  async function run() {
    if (!dataset) return;
    await task("Run DDA", async () => {
      const r = await calculate();
      setResults((old) => [r, ...old].slice(0, 100));
      setResultId(r.id);
      setVariantId(r.variants[0].id);
      openAnalysis("results");
      notify(
        `DDA completed: ${r.file_name} · ${r.variants.map((v) => v.id).join(", ")}`,
      );
    });
  }
  async function runBatch() {
    await task("Run batch", async () => {
      for (const id of batchFiles) {
        const d = files.find((f) => f.id === id)!;
        const c = {
          ...config,
          indices: d.columns.map((_, i) => i),
          start: 0,
          end: (d.rows - 1) / d.rate,
          variants: d.groups.length ? ["CT"] : config.variants,
        };
        const r = await calculate(d, c);
        setResults((old) => [r, ...old]);
        setResultId(r.id);
        notify("DDA completed: " + d.name);
      }
    });
  }
  const dataExport = (kind: string) => exportName(dataset?.name, kind, dataset?.preparation?.recording);
  const resultExport = (kind: string) => exportName(result?.file_name, kind, result?.preparation?.recording);
  function waveformExport() {
    const view = previewGroup ? `_${previewGroup.condition}_${previewMode}` : "";
    const first = previewPage * waveformRows + 1;
    const last = Math.min((previewPage + 1) * waveformRows, preview?.names.length || 0);
    const rows = previewGroup && previewMode === "separate" ? `_trials${first}-${last}` : "";
    return dataExport(`graph_waveform${view}${rows}`);
  }
  async function exportData() {
    if (dataset)
      await task("Export prepared CSV", async () =>
        download(
          dataExport(`prepared${/^E[0-9]+$/.test(dataset.groups[0]?.electrode || "") ? "_" + dataset.groups[0].electrode : ""}.csv`),
          await rpc<string>("export", { id: dataset.id }),
          "text/csv",
        ),
      );
  }
  async function snapshot(recipe = false) {
    const payload = makeSession(
      files,
      dataset,
      config,
      result,
      [...sources.current.values()],
      annotations,
      expert,
      recipe,
    );
    download(
      dataExport(recipe ? "recipe.ddalab" : "session.ddalab"),
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }
  async function importSnapshot(text: string) {
    const p = JSON.parse(text);
    if (p.browser?.version === 1) {
      if (p.browser.annotations) setAnnotations(p.browser.annotations);
      const restoredFiles: Dataset[] = [];
      for (const source of p.browser.files || [])
        restoredFiles.push(await addSource(source));
      const restoredActive = restoredFiles.find(
        (d) => d.name === p.activeFilePath,
      );
      if (restoredActive) selectFile(restoredActive);
      if (p.browser.config) {
        setConfig({ ...defaultConfig, ...p.browser.config });
        setPairText(
          (p.browser.config.pairs || [])
            .map((pair: number[]) => pair.map((i) => i + 1).join(","))
            .join("; "),
        );
      }
      setExpert(Boolean(p.ddaConfig?.expertMode));
      if (p.browser.result) {
        const r = p.browser.result as Result;
        setResults((old) => [r, ...old.filter((v) => v.id !== r.id)]);
        setResultId(r.id);
      }
      await persist();
    } else if (p.ddaResult || p.variants) {
      const r = p.ddaResult || p;
      const normalized: Result = {
        ...r,
        file_name: r.file_name || r.fileName,
        created_at: r.created_at || r.created_at_iso || r.createdAtIso,
        window_centers_seconds:
          r.window_centers_seconds || r.windowCentersSeconds || [],
        trial_groups: (r.trial_groups || []).map((g: any) => ({
          ...g,
          indices: g.indices || g.channel_indices,
        })),
        config: p.ddaConfig
          ? {
              ...defaultConfig,
              window: p.ddaConfig.windowLengthSamples || 50,
              step: p.ddaConfig.windowStepSamples || 10,
              eventOffset: p.ddaConfig.eventOffsetSeconds ?? 1.2,
            }
          : defaultConfig,
        engine: r.engine_label || r.engineLabel || "DDALAB desktop",
        variants: r.variants.map((v: any) => ({
          ...v,
          row_labels: v.row_labels || v.rowLabels || [],
        })),
      };
      if (!normalized.variants?.length)
        throw Error("This file has no DDA results.");
      for (const v of normalized.variants)
        if (
          !Array.isArray(v.matrix) ||
          v.matrix.some(
            (row) =>
              !Array.isArray(row) ||
              row.some((x) => typeof x !== "number" || !Number.isFinite(x)),
          )
        )
          throw Error("The result contains invalid values.");
      setResults((old) => [normalized, ...old]);
      setResultId(normalized.id);
      notify("Imported " + normalized.file_name);
    } else if (p.ddaConfig) {
      const c = p.ddaConfig;
      setConfig((old) => ({
        ...old,
        window: c.windowLengthSamples || 50,
        step: c.windowStepSamples || 10,
        eventOffset: c.eventOffsetSeconds ?? 1.2,
        delays: c.delays || [7, 10],
        terms: c.modelTerms || [1, 2, 10],
      }));
    } else throw Error("Use a DDALAB session or result file.");
    setPage("DDA");
    setSub("DDA");
  }
  function countsCSV() {
    if (!dataset?.counts.length) return;
    const keys = [
      "condition",
      "all_events",
      "artifact_flagged",
      "exported_trials",
    ];
    download(
      dataExport("counts.csv"),
      [
        keys.join(","),
        ...dataset.counts.map((row) => keys.map((k) => row[k]).join(",")),
      ].join("\n") + "\n",
      "text/csv",
    );
  }
  const fileRows =
    dataset?.columns
      .map((name, i) => ({ name, label: signalLabel(name), i }))
      .filter(
        (x) =>
          !search ||
          `${x.name} ${x.label}`.toLowerCase().includes(search.toLowerCase()),
      ) || [];
  const checkGroup = (indices: number[], checked: boolean) =>
    change(
      "indices",
      checked
        ? [...new Set([...config.indices, ...indices])].sort((a, b) => a - b)
        : config.indices.filter((i) => !indices.includes(i)),
    );
  const resultTools = (
    <>
      <div className="toolbar">
        <button onClick={() => importInput.current?.click()}>
          Import .ddalab
        </button>
        <button onClick={() => snapshot()} disabled={!result && !dataset}>
          Export .ddalab
        </button>
        <details className="menu">
          <summary>More Exports ▾</summary>
          <div>
            <button
              disabled={!result}
              onClick={() =>
                result &&
                download(
                  resultExport("results.json"),
                  JSON.stringify(result, null, 2),
                  "application/json",
                )
              }
            >
              Result JSON
            </button>
            <button
              disabled={!result}
              onClick={() =>
                result &&
                download(
                  resultExport("results_all_variants.csv"),
                  result.variants
                    .map((v) => "# " + v.id + "\n" + resultCSV(result, v))
                    .join("\n"),
                  "text/csv",
                )
              }
            >
              All variants CSV
            </button>
            <button onClick={() => snapshot(true)}>Recipe .ddalab</button>
            <button onClick={exportData} disabled={!dataset}>
              Prepared CSV
            </button>
            <button onClick={countsCSV} disabled={!dataset?.counts.length}>
              Condition counts CSV
            </button>
            <button
              onClick={() =>
                savePlot(
                  view === "Heatmap" ? "heatmap-plot" : "result-plot",
                  resultExport(`graph_${variant?.id || "DDA"}`),
                  "svg",
                ).catch(report)
              }
              disabled={!variant}
            >
              Graph SVG
            </button>
            <button
              onClick={() =>
                download(
                  dataExport("annotations.json"),
                  JSON.stringify(annotations, null, 2),
                  "application/json",
                )
              }
            >
              Annotations JSON
            </button>
          </div>
        </details>
      </div>
      <div className="toolbar">
        <button
          className="primary"
          disabled={!variant}
          onClick={() =>
            result &&
            variant &&
            download(resultExport(`results_${variant.id}.csv`), resultCSV(result, variant), "text/csv")
          }
        >
          Save CSV
        </button>
        <button
          className="primary"
          disabled={!variant}
          onClick={() =>
            savePlot(
              view === "Heatmap" ? "heatmap-plot" : "result-plot",
              resultExport(`graph_${variant?.id || "DDA"}`),
              "png",
            ).catch(report)
          }
        >
          Save graph PNG
        </button>
      </div>
    </>
  );
  return (
    <div className="app">
      <header className="top">
        <strong>DDALAB Pooled</strong>
        <span className="current-file">{dataset?.name || "No file open"}</span>
        <div className="toolbar">
          <button onClick={() => setFilePanel(!filePanel)}>Files</button>
          <button disabled={busy} onClick={() => folderInput.current?.click()}>
            Open Folder
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => openInput.current?.click()}
          >
            Open File
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => setUpload(true)}
          >
            Upload recording
          </button>
          <button className="primary" disabled={busy || !dataset} onClick={run}>
            Run DDA
          </button>
        </div>
      </header>
      <div className="open-files">
        <div className="muted">
          Open Files&nbsp; {files.length} file{files.length === 1 ? "" : "s"}{" "}
          open{dataset ? " • " + dataset.name : ""}
        </div>
        <div className="file-tabs">
          {files.map((d) => (
            <div key={d.id} className={active === d.id ? "selected" : ""}>
              <button disabled={busy} onClick={() => selectFile(d)}>
                {d.name}
              </button>
              <button
                className="close"
                aria-label={"Close " + d.name}
                onClick={() => closeFile(d)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      <nav>
        <Tabs
          items={[
            "Overview",
            "Visualize",
            "DDA",
            "Data",
            "Learn",
            "Collaborate",
            "Settings",
            "Notifications",
          ]}
          value={page}
          onChange={setPage}
        />
      </nav>
      <input
        ref={openInput}
        className="hidden"
        type="file"
        multiple
        accept=".csv,.ddalab,.json"
        onChange={(e) => openFiles(e.target.files)}
      />
      <input
        ref={folderInput}
        className="hidden"
        type="file"
        {...{ webkitdirectory: "" }}
        multiple
        onChange={(e) => pickFolder(e.target.files)}
      />
      <input
        ref={importInput}
        className="hidden"
        type="file"
        accept=".ddalab,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void task("Import session", async () =>
              importSnapshot(await f.text()),
            );
          e.target.value = "";
        }}
      />
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <div className="main-shell">
        {filePanel && (
          <aside className="file-panel">
            <h3>Files</h3>
            {files.map((d) => (
              <button
                key={d.id}
                className={active === d.id ? "selected" : ""}
                onClick={() => selectFile(d)}
              >
                {d.name}
              </button>
            ))}
            <button onClick={() => openInput.current?.click()}>
              Open File
            </button>
            <button onClick={() => setUpload(true)}>Upload recording</button>
            <h3>Results</h3>
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setResultId(r.id);
                  setPage("DDA");
                  setSub("DDA");
                }}
              >
                {r.file_name}
                <small>{new Date(r.created_at).toLocaleString()}</small>
              </button>
            ))}
          </aside>
        )}
        <main>
          {page === "DDA" ? (
            <>
              <Tabs
                items={["DDA", "ICA", "Batch", "Connectivity", "Compare"]}
                value={sub}
                onChange={setSub}
              />
              {sub === "DDA" && (
                <div className="dda-layout">
                  <fieldset
                    className="configuration"
                    ref={settingsPanel}
                    tabIndex={-1}
                    aria-label="DDA settings and trial selection"
                  >
                    <legend>DDA Configuration</legend>
                    <div className="config-scroll" ref={settingsScroll}>
                      <fieldset>
                        <legend>Variants</legend>
                        <div className="checks">
                          {["ST", "SY", "DE", "CT", "CD"].map((v) => (
                            <label key={v}>
                              <input
                                type="checkbox"
                                checked={config.variants.includes(v)}
                                onChange={(e) =>
                                  change(
                                    "variants",
                                    e.target.checked
                                      ? [...config.variants, v]
                                      : config.variants.filter((x) => x !== v),
                                  )
                                }
                              />
                              {v}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>Variant Channels</legend>
                        {dataset?.groups.length ? (
                          <>
                            <p className="muted compact">
                              Separate pooled fit per condition
                            </p>
                            <SignalDetails
                              electrode={dataset.groups[0].electrode}
                            />
                            <fieldset>
                              <legend>CT pooled trial columns</legend>
                              <div className="group-checks">
                                {dataset.groups.map((g) => (
                                  <label key={g.condition}>
                                    <input
                                      type="checkbox"
                                      checked={g.indices.every((i) =>
                                        config.indices.includes(i),
                                      )}
                                      onChange={(e) =>
                                        checkGroup(g.indices, e.target.checked)
                                      }
                                    />
                                    {g.condition}:{" "}
                                    {
                                      g.indices.filter((i) =>
                                        config.indices.includes(i),
                                      ).length
                                    }
                                  </label>
                                ))}
                              </div>
                              <div className="selection-mode">
                                Pooled by condition
                              </div>
                              <input
                                className="search"
                                aria-label="Find trials"
                                placeholder="Find trial"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                              />
                              <div className="channel-list">
                                {fileRows.map(({ name, label, i }) => (
                                  <label key={name} title={name}>
                                    <input
                                      type="checkbox"
                                      checked={config.indices.includes(i)}
                                      onChange={() => toggleIndex(i)}
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                              <div className="toolbar">
                                <button
                                  onClick={() =>
                                    change(
                                      "indices",
                                      dataset.columns.map((_, i) => i),
                                    )
                                  }
                                >
                                  Select all trials
                                </button>
                                <button onClick={() => change("indices", [])}>
                                  Clear selection
                                </button>
                              </div>
                            </fieldset>
                          </>
                        ) : dataset ? (
                          <>
                            <input
                              className="search"
                              aria-label="Find channels"
                              placeholder="Find channel"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                            <div className="channel-list">
                              {fileRows.map(({ name, label, i }) => (
                                <label key={name} title={name}>
                                  <input
                                    type="checkbox"
                                    checked={config.indices.includes(i)}
                                    onChange={() => toggleIndex(i)}
                                  />
                                  {i + 1}. {label}
                                </label>
                              ))}
                            </div>
                            <div className="toolbar">
                              <button
                                onClick={() =>
                                  change(
                                    "indices",
                                    dataset.columns.map((_, i) => i),
                                  )
                                }
                              >
                                Select all
                              </button>
                              <button onClick={() => change("indices", [])}>
                                Clear selection
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="muted compact">Open a data file.</p>
                        )}
                      </fieldset>
                      <NumberField
                        label="Window length (samples)"
                        value={config.window}
                        min={1}
                        onChange={(v) => change("window", v)}
                      />
                      <NumberField
                        label="Window step (samples)"
                        value={config.step}
                        min={1}
                        onChange={(v) => change("step", v)}
                      />
                      <NumberField
                        label="Start (s)"
                        value={config.start}
                        min={0}
                        step={0.004}
                        onChange={(v) => change("start", v)}
                      />
                      <NumberField
                        label="End (s)"
                        value={config.end}
                        min={0}
                        step={0.004}
                        onChange={(v) => change("end", v)}
                      />
                      <NumberField
                        label="Event onset from file start (s)"
                        value={config.eventOffset}
                        step={0.001}
                        onChange={(v) => change("eventOffset", v)}
                      />
                      <fieldset>
                        <legend>Expert Mode</legend>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={expert}
                            onChange={(e) => setExpert(e.target.checked)}
                          />
                          Enable advanced DDA controls
                        </label>
                        {config.terms.join(",") === "1,2,10" &&
                          config.order === 4 &&
                          config.nrTau === 2 && (
                            <p className="equation">
                              ẋ = a₁x(t − τ₁) + a₂x(t − τ₂) + a₃x⁴(t − τ₁)
                            </p>
                          )}
                        {expert && (
                          <>
                            <label className="field">
                              <span>Delays</span>
                              <input
                                aria-label="Delays"
                                defaultValue={config.delays.join(",")}
                                onBlur={(e) =>
                                  change("delays", nums(e.target.value))
                                }
                              />
                            </label>
                            <NumberField
                              label="Embedding dim"
                              value={config.dimension}
                              min={1}
                              onChange={(v) => change("dimension", v)}
                            />
                            <NumberField
                              label="Polynomial order"
                              value={config.order}
                              min={1}
                              onChange={(v) => change("order", v)}
                            />
                            <NumberField
                              label="Model delays"
                              value={config.nrTau}
                              min={1}
                              onChange={(v) => change("nrTau", v)}
                            />
                            <label className="field">
                              <span>Model terms</span>
                              <input
                                defaultValue={config.terms.join(",")}
                                onBlur={(e) =>
                                  change("terms", nums(e.target.value))
                                }
                              />
                            </label>
                            <div className="toolbar">
                              <button
                                onClick={() => {
                                  setConfig((c) => ({
                                    ...c,
                                    delays: [7, 10],
                                    terms: [1, 2, 10],
                                    dimension: 4,
                                    order: 4,
                                    nrTau: 2,
                                  }));
                                  setExpert(false);
                                }}
                              >
                                Reset Default
                              </button>
                            </div>
                            {!dataset?.groups.length && (
                              <>
                                <fieldset>
                                  <legend>Conditional variants</legend>
                                  <div className="checks">
                                    {[
                                      "CCD",
                                      "CCDSIG",
                                      "CCDSTAB",
                                      "TRCCD",
                                      "MVCCD",
                                    ].map((v) => (
                                      <label key={v}>
                                        <input
                                          type="checkbox"
                                          checked={config.variants.includes(v)}
                                          onChange={(e) =>
                                            change(
                                              "variants",
                                              e.target.checked
                                                ? [...config.variants, v]
                                                : config.variants.filter(
                                                    (x) => x !== v,
                                                  ),
                                            )
                                          }
                                        />
                                        {v}
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                                <label className="field">
                                  <span>Channel pairs</span>
                                  <input
                                    placeholder="1,2; 2,3"
                                    value={pairText}
                                    onChange={(e) =>
                                      setPairText(e.target.value)
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Conditioning set</span>
                                  <select
                                    value={
                                      config.conditioningStrategy ||
                                      "all_selected"
                                    }
                                    onChange={(e) =>
                                      change(
                                        "conditioningStrategy",
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="all_selected">
                                      All selected
                                    </option>
                                    <option value="auto_target_sparse">
                                      Target sparse
                                    </option>
                                    <option value="auto_shared_parents">
                                      Shared parents
                                    </option>
                                    <option value="auto_group_omp">
                                      Group OMP
                                    </option>
                                  </select>
                                </label>
                                <NumberField
                                  label="Temporal lambda"
                                  value={config.temporalLambda ?? 1}
                                  min={0}
                                  step={0.1}
                                  onChange={(v) => change("temporalLambda", v)}
                                />
                                <NumberField
                                  label="Active sources"
                                  value={config.maxActiveSources ?? 2}
                                  min={1}
                                  onChange={(v) =>
                                    change("maxActiveSources", v)
                                  }
                                />
                              </>
                            )}
                          </>
                        )}
                      </fieldset>
                      <button
                        className="primary wide"
                        disabled={!dataset || busy}
                        onClick={run}
                      >
                        Run DDA
                      </button>
                    </div>
                  </fieldset>
                  <fieldset
                    className="results"
                    ref={resultsPanel}
                    tabIndex={-1}
                    aria-label="DDA results"
                  >
                    <legend>Results</legend>
                    <div className="result-head">
                      <label>
                        Variant{" "}
                        <select
                          value={variant?.id || ""}
                          onChange={(e) => setVariantId(e.target.value)}
                        >
                          {result?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.id} · {signalLabel(v.label)}
                            </option>
                          )) || <option value="">No result</option>}
                        </select>
                      </label>
                      <label>
                        Colors{" "}
                        <select
                          value={scheme}
                          onChange={(e) => setScheme(e.target.value)}
                        >
                          {["Viridis", "Magma", "Coolwarm"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {resultTools}
                    <Tabs
                      items={["Graph", "Heatmap", "Details"]}
                      value={view}
                      onChange={setView}
                    />
                    {variant && result ? (
                      <>
                        {view === "Graph" ? (
                          <LinePlot
                            time={result.window_centers_seconds}
                            values={variant.matrix}
                            names={variant.row_labels}
                            title={
                              result.trial_groups[0]?.electrode || variant.label
                            }
                            ylabel={
                              ["CT", "ST"].includes(variant.id)
                                ? "a1"
                                : variant.id
                            }
                          />
                        ) : view === "Heatmap" ? (
                          <Heatmap
                            values={variant.matrix}
                            names={variant.row_labels}
                            time={result.window_centers_seconds}
                            scheme={scheme}
                          />
                        ) : (
                          <div className="details-scroll">
                            <dl>
                              <dt>File</dt>
                              <dd>{result.file_name}</dd>
                              <dt>Variant</dt>
                              <dd>{variant.id}</dd>
                              {result.trial_groups[0]?.electrode && (
                                <>
                                  <dt>Signal</dt>
                                  <dd>
                                    <SignalDetails
                                      electrode={result.trial_groups[0].electrode}
                                    />
                                  </dd>
                                </>
                              )}
                              <dt>Windows</dt>
                              <dd>{variant.matrix[0]?.length}</dd>
                              <dt>Window length / step</dt>
                              <dd>
                                {result.config.window} / {result.config.step}{" "}
                                samples
                              </dd>
                              <dt>Delays</dt>
                              <dd>{result.config.delays.join(", ")}</dd>
                              <dt>Model terms</dt>
                              <dd>{result.config.terms.join(", ")}</dd>
                              <dt>Created</dt>
                              <dd>
                                {new Date(result.created_at).toLocaleString()}
                              </dd>
                            </dl>
                            <table>
                              <thead>
                                <tr>
                                  <th>Series</th>
                                  <th>Trials</th>
                                  <th>Mean |a₁|</th>
                                  <th>Peak |a₁|</th>
                                </tr>
                              </thead>
                              <tbody>
                                {variant.matrix.map((row, i) => (
                                  <tr key={i}>
                                    <td title={variant.row_labels[i]}>
                                      {signalLabel(variant.row_labels[i])}
                                    </td>
                                    <td>
                                      {result.trial_groups[i]?.indices.length ||
                                        "—"}
                                    </td>
                                    <td>
                                      {(
                                        row.reduce(
                                          (a, v) => a + Math.abs(v),
                                          0,
                                        ) / row.length
                                      ).toPrecision(7)}
                                    </td>
                                    <td>
                                      {Math.max(
                                        ...row.map(Math.abs),
                                      ).toPrecision(7)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : (
                      <Empty
                        text={
                          dataset
                            ? "Select trials and settings. Then select Run DDA."
                            : "Open a data file."
                        }
                      />
                    )}
                  </fieldset>
                </div>
              )}
              {sub === "ICA" && (
                <div className="dda-layout">
                  <fieldset className="configuration">
                    <legend>ICA Configuration</legend>
                    <div className="config-scroll">
                      <p className="muted">
                        {config.indices.length} channels selected
                      </p>
                      <NumberField
                        label="Components"
                        value={icaComponents}
                        min={2}
                        onChange={setIcaComponents}
                      />
                      <NumberField
                        label="Max iterations"
                        value={icaIterations}
                        min={1}
                        onChange={setIcaIterations}
                      />
                      <NumberField
                        label="Tolerance"
                        value={icaTolerance}
                        min={0}
                        step={0.0001}
                        onChange={setIcaTolerance}
                      />
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={icaCenter}
                          onChange={(e) => setIcaCenter(e.target.checked)}
                        />
                        Center channels
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={icaWhiten}
                          onChange={(e) => setIcaWhiten(e.target.checked)}
                        />
                        Whiten channels
                      </label>
                      <button
                        className="primary wide"
                        disabled={!dataset || busy}
                        onClick={() =>
                          task("Run ICA", async () => {
                            const r = await rpc<Ica>("ica", {
                              id: active,
                              config: {
                                indices: config.indices,
                                start: config.start,
                                end: config.end,
                                components: icaComponents,
                                maxIterations: icaIterations,
                                tolerance: icaTolerance,
                                centering: icaCenter,
                                whitening: icaWhiten,
                              },
                            });
                            setIca(r);
                            setIcaSelected(0);
                            if (r.warnings.length)
                              notify(r.warnings.join("\n"));
                          })
                        }
                      >
                        Run ICA
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className="results">
                    <legend>ICA Results</legend>
                    {ica ? (
                      <>
                        <div className="toolbar">
                          <label>
                            Component{" "}
                            <select
                              value={icaSelected}
                              onChange={(e) =>
                                setIcaSelected(Number(e.target.value))
                              }
                            >
                              {ica.components.map((c, i) => (
                                <option key={i} value={i}>
                                  IC {c.id}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            onClick={() =>
                              download(
                                exportName(ica.name, "ICA.json", files.find(d => d.name === ica.name)?.preparation?.recording),
                                JSON.stringify(ica, null, 2),
                                "application/json",
                              )
                            }
                          >
                            Export ICA JSON
                          </button>
                        </div>
                        <Tabs
                          items={[
                            "Time series",
                            "Power spectrum",
                            "Spatial map",
                            "Details",
                          ]}
                          value={icaView}
                          onChange={setIcaView}
                        />
                        {(() => {
                          const c = ica.components[icaSelected];
                          return icaView === "Details" ? (
                            <dl>
                              <dt>Kurtosis</dt>
                              <dd>{c.kurtosis.toPrecision(7)}</dd>
                              <dt>Variance fraction</dt>
                              <dd>{c.variance.toPrecision(7)}</dd>
                              <dt>Convergence</dt>
                              <dd>
                                {ica.warnings.length
                                  ? ica.warnings.join(" ")
                                  : "Converged"}
                              </dd>
                            </dl>
                          ) : icaView === "Spatial map" ? (
                            <table>
                              <thead>
                                <tr>
                                  <th>Channel</th>
                                  <th>Weight</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.spatial.map((v, i) => (
                                  <tr key={i}>
                                    <td title={ica.channels[i]}>
                                      {signalLabel(ica.channels[i])}
                                    </td>
                                    <td>{v.toPrecision(8)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <LinePlot
                              id="ica-plot"
                              time={
                                icaView === "Power spectrum"
                                  ? c.frequencies
                                  : c.series.map(
                                      (_, i) =>
                                        config.start +
                                        (i * (config.end - config.start)) /
                                          (c.series.length - 1),
                                    )
                              }
                              values={[
                                icaView === "Power spectrum"
                                  ? c.power
                                  : c.series,
                              ]}
                              names={["IC " + c.id]}
                              title={"IC " + c.id}
                              ylabel={
                                icaView === "Power spectrum"
                                  ? "Power"
                                  : "Amplitude"
                              }
                            />
                          );
                        })()}
                      </>
                    ) : (
                      <Empty text="Run ICA to show components." />
                    )}
                  </fieldset>
                </div>
              )}
              {sub === "Batch" && (
                <section className="panel">
                  <h3>Batch DDA</h3>
                  <div className="batch-list">
                    {files.map((d) => (
                      <label className="check" key={d.id}>
                        <input
                          type="checkbox"
                          checked={batchFiles.includes(d.id)}
                          onChange={(e) =>
                            setBatchFiles(
                              e.target.checked
                                ? [...batchFiles, d.id]
                                : batchFiles.filter((i) => i !== d.id),
                            )
                          }
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                  <p className="muted">
                    Use the current DDA settings for each selected file.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !batchFiles.length}
                    onClick={runBatch}
                  >
                    Run batch
                  </button>
                  <ResultList
                    results={results}
                    onSelect={(r) => {
                      setResultId(r.id);
                      setSub("DDA");
                    }}
                  />
                </section>
              )}
              {sub === "Connectivity" && (
                <section className="panel">
                  <h3>Connectivity</h3>
                  {variant && result ? (
                    <>
                      <p className="muted">
                        {variant.id} · {signalLabel(variant.label)}
                      </p>
                      <Heatmap
                        values={variant.matrix}
                        names={variant.row_labels}
                        time={result.window_centers_seconds}
                        scheme={scheme}
                      />
                      <p className="muted">
                        {["CD", "CCD", "CCDSIG", "TRCCD", "MVCCD"].includes(
                          variant.id,
                        )
                          ? "Rows show directed channel pairs."
                          : "Select CD or a conditional variant for directed channel results."}
                      </p>
                    </>
                  ) : (
                    <Empty text="Run a channel analysis to show connectivity." />
                  )}
                </section>
              )}
              {sub === "Compare" && (
                <section className="panel">
                  <h3>Compare Results</h3>
                  <div className="toolbar">
                    {[compareA, compareB].map((value, i) => (
                      <label key={i}>
                        Result {i + 1}
                        <select
                          value={value}
                          onChange={(e) =>
                            (i === 0 ? setCompareA : setCompareB)(
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Select result</option>
                          {results.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.file_name} ·{" "}
                              {new Date(r.created_at).toLocaleTimeString()}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {(() => {
                    const a = results.find((r) => r.id === compareA),
                      b = results.find((r) => r.id === compareB);
                    if (!a || !b)
                      return <Empty text="Select two saved results." />;
                    const va = a.variants[0],
                      vb = b.variants[0];
                    const same =
                      a.window_centers_seconds.length ===
                        b.window_centers_seconds.length &&
                      a.window_centers_seconds.every(
                        (t, i) =>
                          Math.abs(t - b.window_centers_seconds[i]) < 1e-10,
                      );
                    return (
                      <>
                        <LinePlot
                          id="compare-plot"
                          time={a.window_centers_seconds}
                          values={
                            same ? [...va.matrix, ...vb.matrix] : va.matrix
                          }
                          names={
                            same
                              ? [
                                  ...va.row_labels.map(
                                    (n) => "A · " + signalLabel(n),
                                  ),
                                  ...vb.row_labels.map(
                                    (n) => "B · " + signalLabel(n),
                                  ),
                                ]
                              : va.row_labels
                          }
                        />
                        {same ? (
                          <table>
                            <thead>
                              <tr>
                                <th>Series</th>
                                <th>RMS difference</th>
                                <th>Max difference</th>
                              </tr>
                            </thead>
                            <tbody>
                              {va.matrix.map(
                                (row, i) =>
                                  vb.matrix[i] && (
                                    <tr key={i}>
                                      <td title={va.row_labels[i]}>
                                        {signalLabel(va.row_labels[i])}
                                      </td>
                                      <td>
                                        {Math.sqrt(
                                          row.reduce(
                                            (s, v, k) =>
                                              s + (v - vb.matrix[i][k]) ** 2,
                                            0,
                                          ) / row.length,
                                        ).toPrecision(7)}
                                      </td>
                                      <td>
                                        {Math.max(
                                          ...row.map((v, k) =>
                                            Math.abs(v - vb.matrix[i][k]),
                                          ),
                                        ).toPrecision(7)}
                                      </td>
                                    </tr>
                                  ),
                              )}
                            </tbody>
                          </table>
                        ) : (
                          <p role="alert">
                            The result time axes differ. Only Result 1 is shown.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </section>
              )}
            </>
          ) : page === "Overview" ? (
            <section className="panel overview">
              <h3>{dataset?.name || "DDALAB Pooled"}</h3>
              {dataset ? (
                <>
                  <dl>
                    <dt>Samples</dt>
                    <dd>{dataset.rows.toLocaleString()}</dd>
                    <dt>Sampling rate</dt>
                    <dd>{Number(dataset.rate.toFixed(6))} Hz</dd>
                    <dt>{dataset.groups.length ? "Trials" : "Channels"}</dt>
                    <dd>{dataset.columns.length}</dd>
                    <dt>Duration</dt>
                    <dd>{dataset.duration.toFixed(3)} s</dd>
                    <dt>Conditions</dt>
                    <dd>
                      {dataset.groups.map((g) => g.condition).join(", ") || "—"}
                    </dd>
                  </dl>
                  <SignalDetails electrode={dataset.groups[0]?.electrode} />
                  {preview && (
                    <LinePlot
                      id="overview-plot"
                      time={preview.time}
                      values={preview.values.slice(0, 1)}
                      names={preview.names.slice(0, 1)}
                      ylabel="µV"
                    />
                  )}
                  <button
                    className="primary"
                    onClick={() => {
                      setPage("DDA");
                      setSub("DDA");
                    }}
                  >
                    DDA
                  </button>
                </>
              ) : (
                <Empty text="Open a prepared CSV or select a recording.">
                  <div className="toolbar">
                    <button
                      className="primary"
                      onClick={() => openInput.current?.click()}
                    >
                      Open File
                    </button>
                    <button className="primary" onClick={() => setUpload(true)}>
                      Upload recording
                    </button>
                  </div>
                </Empty>
              )}
              <ResultList
                results={results}
                onSelect={(r) => {
                  setResultId(r.id);
                  setPage("DDA");
                  setSub("DDA");
                }}
              />
            </section>
          ) : page === "Visualize" ? (
            <section className="panel">
              <h3>Visualize</h3>
              {dataset ? (
                <>
                  <div className="toolbar">
                    {previewGroup ? (
                      <>
                        <label className="preview-picker">
                          Condition
                          <select
                            value={previewGroup.condition}
                            onChange={(e) => {
                              const group = dataset.groups.find(
                                (g) => g.condition === e.target.value,
                              );
                              if (group) {
                                setPreviewCondition(group.condition);
                                setPreviewIndices(previewMode === "single" ? [group.indices[0]] : group.indices);
                              }
                            }}
                          >
                            {dataset.groups.map((group) => (
                              <option
                                key={group.condition}
                                value={group.condition}
                              >
                                {group.condition} ({group.indices.length} trials)
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="preview-picker">
                          Trial view
                          <select value={previewMode} onChange={(e) => {
                            const mode = e.target.value as typeof previewMode;
                            if (mode === "single") setPreviewIndices([previewIndices[0] ?? previewGroup.indices[0]]);
                            else if (previewMode === "single") setPreviewIndices(previewGroup.indices);
                            setPreviewMode(mode);
                          }}>
                            <option value="mean">Trial average</option>
                            <option value="separate">Separate trials</option>
                            <option value="single">One trial</option>
                          </select>
                        </label>
                        {previewMode === "single" && <label className="preview-picker">
                          Trial
                          <select
                            value={previewIndices[0] ?? previewGroup.indices[0]}
                            onChange={(e) =>
                              setPreviewIndices([Number(e.target.value)])
                            }
                          >
                            {previewGroup.indices.map((i) => (
                              <option key={i} value={i}>
                                {trialLabel(dataset.columns[i])?.trial ||
                                  signalLabel(dataset.columns[i])}
                              </option>
                            ))}
                          </select>
                        </label>}
                      </>
                    ) : (
                      <label className="preview-picker">
                        Channel
                        <select
                          value={previewIndices[0] ?? 0}
                          onChange={(e) =>
                            setPreviewIndices([Number(e.target.value)])
                          }
                        >
                          {dataset.columns.map((name, i) => (
                            <option key={i} value={i}>
                              {signalLabel(name)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <NumberField
                      label="Start (s)"
                      value={previewStart}
                      min={0}
                      step={0.004}
                      onChange={setPreviewStart}
                    />
                    <NumberField
                      label="End (s)"
                      value={previewEnd}
                      min={0}
                      step={0.004}
                      onChange={setPreviewEnd}
                    />
                    <button
                      disabled={!preview?.names.length}
                      onClick={() =>
                        savePlot("waveform-plot", waveformExport(), "png").catch(
                          report,
                        )
                      }
                    >
                      Save graph PNG
                    </button>
                  </div>
                  <SignalDetails electrode={previewGroup?.electrode}
                    selected={previewElectrodes}
                    onChange={dataset.electrodes?.length ? setPreviewElectrodes : undefined}
                    onUpload={() => setUpload(true)} />
                  <div className={previewGroup && previewMode !== "single" ? "waveform-view" : ""}>
                    {previewGroup && previewMode !== "single" && <fieldset className="waveform-trials">
                      <legend>Trials · {previewGroup.condition}</legend>
                      <p>{previewIndices.length} of {previewGroup.indices.length} selected</p>
                      <div className="waveform-trial-list">
                        {previewGroup.indices.map(i => <label key={i}>
                          <input type="checkbox" checked={previewIndices.includes(i)} onChange={e =>
                            setPreviewIndices(old => e.target.checked
                              ? [...old, i].sort((a, b) => a - b) : old.filter(x => x !== i))} />
                          {trialLabel(dataset.columns[i])?.trial || signalLabel(dataset.columns[i])}
                        </label>)}
                      </div>
                      <div className="toolbar selection-actions">
                        <button onClick={() => setPreviewIndices(previewGroup.indices)}>Select all</button>
                        <button onClick={() => setPreviewIndices([])}>Clear</button>
                      </div>
                    </fieldset>}
                    {!preview ? <Empty text="Load waveform…" /> : !preview.names.length
                      ? <Empty text={dataset.electrodes?.length && !previewElectrodes.length ? "Select an electrode." : "Select a trial."} />
                      : previewGroup && previewMode === "separate" ? <StackedWaveforms
                        key={`${active}:${previewCondition}:${previewElectrodes.join(",")}`}
                        id="waveform-plot" time={preview.time} values={preview.values}
                        names={preview.names} title={preview.source}
                        page={previewPage} onPage={setPreviewPage} /> : <LinePlot
                      key={`${active}:${previewMode}:${previewCondition}:${previewElectrodes.join(",")}`}
                      id="waveform-plot"
                      time={preview.time}
                      values={preview.values}
                      names={preview.names}
                      title={preview.source}
                      ylabel="µV"
                    />}
                  </div>
                  <fieldset>
                    <legend>Annotations</legend>
                    <div className="toolbar">
                      <NumberField
                        label="Time (s)"
                        value={annotationTime}
                        step={0.004}
                        onChange={setAnnotationTime}
                      />
                      <input
                        aria-label="Annotation label"
                        placeholder="Label"
                        value={annotationLabel}
                        onChange={(e) => setAnnotationLabel(e.target.value)}
                      />
                      <button
                        disabled={!annotationLabel.trim()}
                        onClick={() => {
                          setAnnotations((a) => [
                            ...a,
                            {
                              file: dataset.name,
                              time: annotationTime,
                              label: annotationLabel.trim(),
                            },
                          ]);
                          setAnnotationLabel("");
                        }}
                      >
                        Add annotation
                      </button>
                    </div>
                    <table>
                      <tbody>
                        {annotations
                          .filter((a) => a.file === dataset.name)
                          .map((a, i) => (
                            <tr key={i}>
                              <td>{a.time} s</td>
                              <td>{a.label}</td>
                              <td>
                                <button
                                  onClick={() =>
                                    setAnnotations((old) =>
                                      old.filter((x) => x !== a),
                                    )
                                  }
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </fieldset>
                </>
              ) : (
                <Empty text="Open a data file." />
              )}
            </section>
          ) : page === "Data" ? (
            <section className="panel">
              <h3>Data</h3>
              {dataset ? (
                <>
                  <div className="toolbar">
                    <button className="primary" onClick={exportData}>
                      Save prepared CSV
                    </button>
                    <button
                      disabled={!dataset.counts.length}
                      onClick={countsCSV}
                    >
                      Save counts CSV
                    </button>
                  </div>
                  {dataset.counts.length > 0 && (
                    <table>
                      <thead>
                        <tr>
                          <th>Condition</th>
                          <th>All events</th>
                          <th>Artifact flagged</th>
                          <th>Exported trials</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataset.counts.map((row, i) => (
                          <tr key={i}>
                            {[
                              "condition",
                              "all_events",
                              "artifact_flagged",
                              "exported_trials",
                            ].map((key) => (
                              <td key={key}>{row[key]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {dataset.preparation && (
                    <dl>
                      <dt>Interpolated channels</dt>
                      <dd>
                        {dataset.preparation.bad_channels.join(", ") || "None"}
                      </dd>
                      <dt>Epochs</dt>
                      <dd>{dataset.preparation.epochs}</dd>
                      <dt>Global SD</dt>
                      <dd>{dataset.preparation.global_sd} µV</dd>
                    </dl>
                  )}
                  <h3>Samples</h3>
                  <div className="data-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Time (s)</th>
                          {preview?.names.slice(0, 5).map((n) => (
                            <th key={n} title={n}>
                              {signalLabel(n)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview?.time.slice(0, 100).map((t, i) => (
                          <tr key={i}>
                            <td>{t.toPrecision(8)}</td>
                            {preview.values.slice(0, 5).map((v, k) => (
                              <td key={k}>{v[i]?.toPrecision(9)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <Empty text="Open a data file." />
              )}
            </section>
          ) : page === "Learn" ? (
            <section className="panel reading">
              <h3>Prepare a recording</h3>
              <ol>
                <li>
                  Select <b>Upload recording</b>.
                </li>
                <li>Select the EDF, acquisition TXT, and conditions CSV.</li>
                <li>Select the electrodes and conditions.</li>
                <li>
                  Select <b>Run preparation</b>.
                </li>
                <li>
                  Select trials in <b>DDA</b>. Select <b>Run DDA</b>.
                </li>
              </ol>
              <h3>Preparation recipe</h3>
              <dl>
                <dt>Input</dt>
                <dd>1000 Hz HydroCel, E1–E129 and Status</dd>
                <dt>Reference</dt>
                <dd>E57 / E100</dd>
                <dt>Filters</dt>
                <dd>57–63 Hz stop; 0.1–30 Hz pass</dd>
                <dt>Channel rejection</dt>
                <dd>Normalized probability, threshold 2.5</dd>
                <dt>Interpolation</dt>
                <dd>Spherical spline</dd>
                <dt>Output</dt>
                <dd>250 Hz; −200 to +800 ms epochs</dd>
                <dt>Baseline</dt>
                <dd>−200 to 0 ms</dd>
                <dt>Artifact threshold</dt>
                <dd>±4.5 global SD; all channels</dd>
              </dl>
              <h3>Pooled CT</h3>
              <p>
                Each condition has one fit across its selected trials. The graph
                shows a₁ at the fitted sample centers.
              </p>
              <p>
                Event onset changes the graph time axis. It does not change the
                voltage samples.
              </p>
              <h3>Graph controls</h3>
              <p>
                Drag across a graph to zoom. Double-click to reset. Select a
                legend item to hide its trace.
              </p>
              <h3>Files</h3>
              <p>
                Files stay on this device. Export a .ddalab session to transfer
                your prepared files and results.
              </p>
              <p>
                Prepared CSV files use a time column and labelled trial columns.
                For the conditions CSV, use sec_time and label columns, or
                Duration, Intertrial Interval and Condition columns.
              </p>
              <p>
                <a
                  href="https://github.com/samanthalin-meep/DDA-Analysis-Deployed"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source and validation
                </a>
              </p>
            </section>
          ) : page === "Collaborate" ? (
            <section className="panel reading">
              <h3>Share a Session</h3>
              <p>
                Export a .ddalab file. The file contains prepared data,
                settings, annotations, and the selected result.
              </p>
              <div className="toolbar">
                <button
                  className="primary"
                  disabled={!dataset && !result}
                  onClick={() => snapshot()}
                >
                  Export .ddalab
                </button>
                <button onClick={() => importInput.current?.click()}>
                  Import .ddalab
                </button>
              </div>
            </section>
          ) : page === "Settings" ? (
            <section className="panel reading">
              <h3>Settings</h3>
              <label className="field">
                <span>Theme</span>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    localStorage.setItem(
                      "dda-remember",
                      String(e.target.checked),
                    );
                    void save(
                      "files",
                      e.target.checked ? [...sources.current.values()] : [],
                    );
                  }}
                />
                Keep prepared files on this device
              </label>
              <p className="muted">
                Raw EDF, TXT, and conditions CSV files are removed after
                preparation.
              </p>
              <button
                onClick={() => {
                  void save("files", []);
                  void save("results", []);
                  void save("annotations", []);
                  setRemember(false);
                  localStorage.setItem("dda-remember", "false");
                  notify(
                    "Saved browser data cleared. Open files remain available until this tab closes.",
                  );
                }}
              >
                Clear saved browser data
              </button>
              <h3>About</h3>
              <p>DDALAB Pooled · Browser edition</p>
              <p>Original dda-rs analysis engine. Local browser processing.</p>
              <a
                href="https://github.com/samanthalin-meep/DDA-Analysis-Deployed/tree/main/pages"
                target="_blank"
                rel="noreferrer"
              >
                Source and licenses
              </a>
            </section>
          ) : (
            <section className="panel">
              <h3>Notifications</h3>
              <button
                disabled={!notes.length}
                onClick={() =>
                  download(
                    dataExport("log.txt"),
                    notes.map((n) => n.time + " " + n.text).join("\n"),
                  )
                }
              >
                Export log
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n, i) => (
                    <tr key={i}>
                      <td>{n.time}</td>
                      <td className="log">{n.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!notes.length && <Empty text="No notifications." />}
            </section>
          )}
        </main>
      </div>
      <footer>
        <span role="status">
          {status}
          {busy ? "…" : ""}
        </span>
        {busy && (
          <>
            <progress max="1" value={progress} />
            <button onClick={cancel}>Cancel</button>
          </>
        )}
      </footer>
      {upload && (
        <div className="modal-shade">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
          >
            <form onSubmit={prepareRecording}>
              <div className="modal-title">
                <h2 id="upload-title">Prepare recording</h2>
                <button
                  type="button"
                  aria-label="Close upload"
                  disabled={busy}
                  onClick={() => setUpload(false)}
                >
                  ×
                </button>
              </div>
              <p className="muted">
                Select the three files from one recording. Files stay on this
                device.
              </p>
              <div className="upload-files">
                {(["edf", "txt", "csv"] as const).map((key) => (
                  <label key={key}>
                    <span>
                      {key === "edf"
                        ? "EDF recording"
                        : key === "txt"
                          ? "Acquisition TXT"
                          : "Conditions CSV"}
                    </span>
                    <input
                      type="file"
                      required={!uploadFiles[key]}
                      accept={"." + key}
                      disabled={busy}
                      onChange={(e) => pickRecording(key, e.target.files?.[0])}
                    />
                    {uploadFiles[key] && (
                      <small>{uploadFiles[key]!.name}</small>
                    )}
                  </label>
                ))}
              </div>
              <label className="field">
                <span>Recording ID</span>
                <input
                  required
                  pattern="[A-Za-z0-9_]+"
                  autoComplete="off"
                  value={recording}
                  disabled={busy}
                  onChange={(e) => setRecording(e.target.value)}
                />
              </label>
              <div className="upload-groups">
                <fieldset aria-busy={recordingOptions.edf.reading}>
                  <legend>Electrodes</legend>
                  {!electrodes.length && (
                    <p
                      role={recordingOptions.edf.error ? "alert" : "status"}
                      className={
                        recordingOptions.edf.error ? "error-text" : "muted"
                      }
                    >
                      {recordingOptions.edf.reading
                        ? "Read EDF header…"
                        : recordingOptions.edf.error || "Select an EDF file."}
                    </p>
                  )}
                  <div className="electrode-grid">
                    {electrodes.map((name) => (
                      <label key={name}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={electrodeSelection.includes(name)}
                          onChange={(e) =>
                            setElectrodeSelection(
                              e.target.checked
                                ? [...electrodeSelection, name].sort(
                                    (a, b) =>
                                      Number(a.slice(1)) - Number(b.slice(1)),
                                  )
                                : electrodeSelection.filter((x) => x !== name),
                            )
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                  <div className="toolbar upload-selection-actions">
                    <button
                      type="button"
                      disabled={busy || !electrodes.length}
                      onClick={() => setElectrodeSelection(electrodes)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      disabled={busy || !electrodeSelection.length}
                      onClick={() => setElectrodeSelection([])}
                    >
                      Clear
                    </button>
                    <span className="muted">
                      {electrodeSelection.length} selected
                    </span>
                  </div>
                </fieldset>
                <fieldset aria-busy={recordingOptions.csv.reading}>
                  <legend>Conditions</legend>
                  {!conditions.length && (
                    <p
                      role={recordingOptions.csv.error ? "alert" : "status"}
                      className={
                        recordingOptions.csv.error ? "error-text" : "muted"
                      }
                    >
                      {recordingOptions.csv.reading
                        ? "Read conditions…"
                        : recordingOptions.csv.error || "Select a conditions CSV."}
                    </p>
                  )}
                  <div className="condition-list">
                    {conditions.map((name) => (
                      <label className="check" key={name}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={conditionSelection.includes(name)}
                          onChange={(e) =>
                            setConditionSelection(
                              e.target.checked
                                ? conditions.filter(
                                    (c) =>
                                      c === name ||
                                      conditionSelection.includes(c),
                                  )
                                : conditionSelection.filter((x) => x !== name),
                            )
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                  <div className="toolbar upload-selection-actions">
                    <button
                      type="button"
                      disabled={busy || !conditions.length}
                      onClick={() => setConditionSelection(conditions)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      disabled={busy || !conditionSelection.length}
                      onClick={() => setConditionSelection([])}
                    >
                      Clear
                    </button>
                    <span className="muted">
                      {conditionSelection.length} selected
                    </span>
                  </div>
                </fieldset>
              </div>
              {electrodeSelection.length > 1 && (
                <fieldset className="electrode-export">
                  <legend>Electrode export</legend>
                  <label className="check">
                    <input
                      type="radio"
                      name="average"
                      disabled={busy}
                      checked={!average}
                      onChange={() => setAverage(false)}
                    />
                    Separate files
                  </label>
                  <label className="check">
                    <input
                      type="radio"
                      name="average"
                      disabled={busy}
                      checked={average}
                      onChange={() => setAverage(true)}
                    />
                    Average within each trial
                  </label>
                </fieldset>
              )}
              <details className="recipe">
                <summary>Preparation settings</summary>
                <p>E57/E100 reference · 57–63 Hz stop · 0.1–30 Hz pass</p>
                <p>
                  Probability threshold 2.5 · Spherical interpolation · 250 Hz
                </p>
                <p>
                  Epoch −200 to +800 ms · Baseline −200 to 0 ms · Artifact ±4.5
                  global SD
                </p>
              </details>
              {busy && (
                <div className="upload-progress">
                  <span>{status}</span>
                  <progress value={progress} max="1" />
                </div>
              )}
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => (busy ? cancel() : setUpload(false))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    busy ||
                    !recording ||
                    recordingOptions.edf.reading ||
                    recordingOptions.csv.reading ||
                    !!recordingOptions.edf.error ||
                    !!recordingOptions.csv.error ||
                    !electrodeSelection.length ||
                    !conditionSelection.length ||
                    !uploadFiles.edf ||
                    !uploadFiles.txt ||
                    !uploadFiles.csv
                  }
                >
                  Run preparation
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function ResultList({
  results,
  onSelect,
}: {
  results: Result[];
  onSelect: (r: Result) => void;
}) {
  return results.length > 0 ? (
    <>
      <h3>Saved Results</h3>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Variants</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id}>
              <td>{r.file_name}</td>
              <td>{r.variants.map((v) => v.id).join(", ")}</td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>
                <button onClick={() => onSelect(r)}>Open result</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  ) : null;
}
createRoot(document.getElementById("root")!).render(<App />);
