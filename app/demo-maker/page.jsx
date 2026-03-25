import DemoMakerBootstrap from "../DemoMakerBootstrap";

export default function DemoMakerPage() {
  return (
    <>
      <DemoMakerBootstrap />
      <div className="backdrop-glow" aria-hidden="true"></div>

      <main className="demo-maker-shell">
        <header className="demo-maker-header">
          <div className="demo-maker-topline">
            <div className="workspace-switch" aria-label="Workspace switch">
              <a href="/">Recorder</a>
              <span>Demo Maker</span>
            </div>
            <p className="session-badge">Desktop-first demo capture</p>
          </div>

          <div className="demo-maker-hero">
            <div className="title-copy">
              <p className="eyebrow">Demo Maker</p>
              <h1>Record short walkthroughs with auto focus.</h1>
              <p className="lead">
                Capture the composed scene, let click and typing activity drive live zoom, then
                export the finished video and a clipped GIF from one workflow.
              </p>
            </div>

            <div className="demo-maker-summary">
              <p className="demo-summary-line">Composed scene output</p>
              <p className="demo-summary-line">Auto zoom on click + type</p>
              <p className="demo-summary-line">Trim-to-GIF export</p>
            </div>
          </div>
        </header>

        <section className="demo-maker-workspace">
          <section className="demo-stage-panel">
            <div className="demo-stage-head">
              <div className="section-heading">
                <p className="section-kicker">Live Demo Preview</p>
                <h2>Composed capture canvas</h2>
              </div>

              <div className="demo-stage-actions">
                <span id="dmDesktopModePill" className="demo-inline-pill" data-tone="ready">
                  desktop mode
                </span>
                <button id="dmReconnectMonitorBtn" className="btn btn-ghost">
                  Reconnect Monitor
                </button>
              </div>
            </div>

            <section className="demo-telemetry-strip" aria-label="Demo session status">
              <article className="telemetry-pill">
                <span className="status-label">Sources</span>
                <span id="dmSourcesStatus" className="status-value">
                  idle
                </span>
              </article>

              <article className="telemetry-pill">
                <span className="status-label">Recording</span>
                <span id="dmRecordingStatus" className="status-value">
                  idle
                </span>
              </article>

              <article className="telemetry-pill">
                <span className="status-label">Auto Focus</span>
                <span id="dmDemoSummary" className="status-value">
                  pending
                </span>
              </article>

              <article className="telemetry-pill">
                <span className="status-label">Elapsed</span>
                <span id="dmElapsedTime" className="status-value">
                  00:00
                </span>
              </article>
            </section>

            <div className="demo-stage-frame-shell">
              <div className="demo-stage-frame">
                <canvas id="dmCompositeCanvas" width="1280" height="720"></canvas>
              </div>
            </div>

            <p className="stage-hint">
              Drag the webcam inside the canvas. Auto-focus follows click and typing activity while
              demo mode is armed.
            </p>
          </section>

          <aside className="demo-side-panel">
            <section className="inspector-panel session-panel">
              <div className="panel-intro">
                <p className="section-kicker">Capture</p>
                <h2>Session controls</h2>
                <p className="section-copy">
                  Start sources, record the walkthrough, then move straight into export.
                </p>
              </div>

              <section className="flow-block">
                <div className="flow-heading">
                  <div>
                    <h3>Sources</h3>
                    <p>Use the current renderer pipeline for screen, webcam, and microphone.</p>
                  </div>
                </div>

                <div className="button-grid">
                  <button id="dmStartSourcesBtn" className="btn btn-primary">
                    Start Sources
                  </button>
                  <button id="dmStopSourcesBtn" className="btn" disabled>
                    Stop Sources
                  </button>
                </div>

                <p id="dmCaptureHint" className="capture-hint" data-tone="idle" role="status" aria-live="polite">
                  Ready to request screen, camera, and microphone permissions.
                </p>

                <button id="dmReplaceScreenBtn" className="btn btn-secondary btn-full">
                  Replace Screen
                </button>
              </section>

              <section className="flow-block">
                <div className="flow-heading">
                  <div>
                    <h3>Recorder</h3>
                    <p>Stop recording to unlock trim and export.</p>
                  </div>
                </div>

                <div className="button-grid">
                  <button id="dmStartRecordBtn" className="btn btn-accent" disabled>
                    Start Recording
                  </button>
                  <button id="dmStopRecordBtn" className="btn" disabled>
                    Stop Recording
                  </button>
                </div>
              </section>
            </section>

            <section className="inspector-panel demo-maker-config">
              <div className="panel-intro">
                <p className="section-kicker">Auto Focus</p>
                <h2>Demo zoom behavior</h2>
                <p className="section-copy">
                  Desktop monitor connects automatically when available. Adjust the zoom feel
                  before you record.
                </p>
              </div>

              <label className="inline-toggle inline-toggle-wide">
                <input id="dmDemoModeToggle" type="checkbox" defaultChecked />
                Auto zoom enabled
              </label>

              <p className="demo-status" data-state="idle" role="status" aria-live="polite">
                <span className="status-label">Monitor Status</span>
                <span id="dmDemoStatus">waiting for desktop monitor</span>
              </p>

              <div className="field-grid">
                <div className="field-item">
                  <label htmlFor="dmResolutionSelect">Resolution</label>
                  <select id="dmResolutionSelect" defaultValue="1280x720">
                    <option value="1280x720">1280 x 720</option>
                    <option value="1920x1080">1920 x 1080</option>
                    <option value="2560x1440">2560 x 1440</option>
                  </select>
                </div>

                <div className="field-item">
                  <label htmlFor="dmFpsSelect">FPS</label>
                  <select id="dmFpsSelect" defaultValue="30">
                    <option value="24">24</option>
                    <option value="30">30</option>
                    <option value="60">60</option>
                  </select>
                </div>
              </div>

              <div className="control-stack">
                <div>
                  <label htmlFor="dmDemoPresetSelect">Preset</label>
                  <select id="dmDemoPresetSelect" defaultValue="subtle">
                    <option value="subtle">Subtle Focus</option>
                    <option value="balanced">Balanced</option>
                    <option value="intense">Intense</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <label className="inline-toggle">
                  <input id="dmCameraEnabledToggle" type="checkbox" defaultChecked />
                  Camera overlay on
                </label>

                <label className="inline-toggle">
                  <input id="dmTriggerClickToggle" type="checkbox" defaultChecked />
                  Click trigger
                </label>

                <label className="inline-toggle">
                  <input id="dmTriggerTypeToggle" type="checkbox" defaultChecked />
                  Typing trigger
                </label>

                <div className="slider-line">
                  <label htmlFor="dmWebcamSizeRange">Webcam size</label>
                  <input id="dmWebcamSizeRange" type="range" min="12" max="42" defaultValue="22" />
                  <output id="dmWebcamSizeValue">22%</output>
                </div>

                <div className="slider-line">
                  <label htmlFor="dmZoomStrengthRange">Zoom strength</label>
                  <input id="dmZoomStrengthRange" type="range" min="5" max="80" defaultValue="24" />
                  <output id="dmZoomStrengthValue">24%</output>
                </div>

                <div className="slider-line">
                  <label htmlFor="dmZoomDurationRange">Zoom duration</label>
                  <input id="dmZoomDurationRange" type="range" min="200" max="2000" defaultValue="700" />
                  <output id="dmZoomDurationValue">700ms</output>
                </div>

                <div className="slider-line">
                  <label htmlFor="dmCooldownRange">Cooldown</label>
                  <input id="dmCooldownRange" type="range" min="0" max="3000" defaultValue="650" />
                  <output id="dmCooldownValue">650ms</output>
                </div>

                <div className="slider-line">
                  <label htmlFor="dmTypingHoldRange">Typing hold</label>
                  <input id="dmTypingHoldRange" type="range" min="200" max="3000" defaultValue="1200" />
                  <output id="dmTypingHoldValue">1200ms</output>
                </div>
              </div>
            </section>

            <section id="dmExportPanel" className="inspector-panel export-panel" data-ready="false">
              <div className="panel-intro">
                <p className="section-kicker">Export</p>
                <h2>Trim and generate GIF</h2>
                <p className="section-copy">
                  Demo Maker saves a normal video first, then derives a clipped GIF from the same
                  recording.
                </p>
              </div>

              <div className="export-placeholder" id="dmExportPlaceholder">
                Record a short walkthrough to unlock trim and export.
              </div>

              <div className="export-ready-stack">
                <video id="dmRecordingPreviewVideo" className="export-preview" controls playsInline></video>

                <div className="export-meta-grid">
                  <div className="export-meta-card">
                    <span className="status-label">Recorded Duration</span>
                    <strong id="dmRecordedDuration">00:00</strong>
                  </div>

                  <div className="export-meta-card">
                    <span className="status-label">GIF Clip</span>
                    <strong id="dmClipDuration">00:00</strong>
                  </div>
                </div>

                <div className="trim-grid">
                  <div className="slider-line slider-line-stack">
                    <label htmlFor="dmTrimStartRange">Trim start</label>
                    <input id="dmTrimStartRange" type="range" min="0" max="0" step="100" value="0" />
                    <output id="dmTrimStartValue">00:00</output>
                  </div>

                  <div className="slider-line slider-line-stack">
                    <label htmlFor="dmTrimEndRange">Trim end</label>
                    <input id="dmTrimEndRange" type="range" min="0" max="0" step="100" value="0" />
                    <output id="dmTrimEndValue">00:00</output>
                  </div>
                </div>

                <div className="field-grid">
                  <div className="field-item">
                    <label htmlFor="dmGifPresetSelect">GIF preset</label>
                    <select id="dmGifPresetSelect" defaultValue="medium">
                      <option value="small">Small · 480w / 10fps</option>
                      <option value="medium">Medium · 640w / 12fps</option>
                      <option value="large">Large · 720w / 15fps</option>
                    </select>
                  </div>

                  <div className="field-item">
                    <label htmlFor="dmVideoNameInput">Base file name</label>
                    <input id="dmVideoNameInput" className="text-input" type="text" defaultValue="frameforge-demo" />
                  </div>
                </div>

                <p id="dmExportStatus" className="capture-hint" data-tone="idle">
                  The default GIF clip is capped at 15 seconds.
                </p>

                <button id="dmExportBundleBtn" className="btn btn-primary btn-full" disabled>
                  Export Video + GIF
                </button>

                <div id="dmExportResult" className="export-result" hidden>
                  <p className="status-label">Saved To</p>
                  <p id="dmExportPaths"></p>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </main>

      <video id="dmScreenVideo" playsInline muted></video>
      <video id="dmWebcamVideo" playsInline muted></video>
    </>
  );
}
