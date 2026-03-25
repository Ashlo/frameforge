import RecorderBootstrap from "./RecorderBootstrap";

export default function Page() {
  return (
    <>
      <RecorderBootstrap />
      <div className="backdrop-glow" aria-hidden="true"></div>

      <main className="app-shell">
        <header className="app-header">
          <p className="eyebrow">Frameforge Desktop Recorder</p>
          <div className="header-row">
            <div className="title-copy">
              <h1>Frameforge Console</h1>
              <p className="lead">
                Preview first. Core recording actions stay visible, while rig and demo controls
                stay available on demand.
              </p>
            </div>
            <div className="header-actions">
              <a className="switch-link" href="/demo-maker">
                Open Demo Maker
              </a>
              <p className="session-badge">Operator workspace</p>
            </div>
          </div>
        </header>

        <section className="workspace">
          <section className="stage-wrap">
            <div className="stage-head">
              <div className="section-heading">
                <p className="section-kicker">Program Monitor</p>
                <h2>Live composite preview</h2>
              </div>

              <button id="togglePanelBtn" className="btn btn-ghost">
                Focus Preview
              </button>
            </div>

            <section className="telemetry-strip" aria-label="Session telemetry">
              <article className="telemetry-pill">
                <span className="status-label">Sources</span>
                <span id="sourcesStatus" className="status-value">
                  idle
                </span>
              </article>

              <article className="telemetry-pill">
                <span className="status-label">Recording</span>
                <span id="recordingStatus" className="status-value">
                  idle
                </span>
              </article>

              <article className="telemetry-pill">
                <span className="status-label">Started At</span>
                <span id="recordingStartTime" className="status-value">
                  --:--:--
                </span>
              </article>

              <article className="telemetry-pill">
                <span className="status-label">Elapsed</span>
                <span id="elapsedTime" className="status-value">
                  00:00:00
                </span>
              </article>
            </section>

            <div className="stage-frame-shell">
              <div className="stage-frame">
                <canvas id="compositeCanvas" width="1280" height="720"></canvas>
              </div>
            </div>

            <p className="stage-hint">
              Drag the webcam rig directly on the canvas. Use Replace Screen if the capture target
              changes or stalls.
            </p>
          </section>

          <aside className="controls">
            <section className="inspector-panel session-panel">
              <div className="panel-intro">
                <p className="section-kicker">Session</p>
                <h2>Capture and record</h2>
                <p className="section-copy">
                  The core workflow stays visible so the session is easy to operate at a glance.
                </p>
              </div>

              <section className="flow-block">
                <div className="flow-heading">
                  <div>
                    <h3>Capture sources</h3>
                    <p>Authorize screen, camera, and microphone access.</p>
                  </div>
                </div>

                <div className="button-grid">
                  <button id="startSourcesBtn" className="btn btn-primary">
                    Start Sources
                  </button>
                  <button id="stopSourcesBtn" className="btn" disabled>
                    Stop Sources
                  </button>
                </div>

                <p id="captureHint" className="capture-hint" data-tone="idle" role="status" aria-live="polite">
                  Ready to request screen, camera, and microphone permissions.
                </p>

                <button id="replaceScreenBtn" className="btn btn-secondary btn-full">
                  Replace Screen
                </button>
              </section>

              <section className="flow-block">
                <div className="flow-heading">
                  <div>
                    <h3>Recorder</h3>
                    <p>Start once framing is ready. Stop to finalize and export.</p>
                  </div>
                </div>

                <div className="button-grid">
                  <button id="startRecordBtn" className="btn btn-accent" disabled>
                    Start Recording
                  </button>
                  <button id="stopRecordBtn" className="btn" disabled>
                    Stop Recording
                  </button>
                </div>

                <a id="downloadLink" className="download-link" download>
                  Download Recording
                </a>
              </section>
            </section>

            <details className="inspector-panel disclosure-panel rig-panel">
              <summary className="disclosure-summary">
                <div className="summary-main">
                  <p className="section-kicker">Rig Console</p>
                  <h2>Output and composition</h2>
                </div>

                <div className="summary-side">
                  <span id="rigSummary" className="panel-summary">
                    1080p / 30 fps / camera on
                  </span>
                  <span className="summary-arrow" aria-hidden="true"></span>
                </div>
              </summary>

              <div className="disclosure-body">
                <div className="rig-grid">
                  <section className="rig-block">
                    <h3>Output bus</h3>

                    <div className="field-grid">
                      <div className="field-item">
                        <label htmlFor="resolutionSelect">Resolution</label>
                        <select id="resolutionSelect" defaultValue="1920x1080">
                          <option value="1280x720">1280 x 720</option>
                          <option value="1920x1080">1920 x 1080</option>
                          <option value="2560x1440">2560 x 1440</option>
                        </select>
                      </div>

                      <div className="field-item">
                        <label htmlFor="fpsSelect">FPS</label>
                        <select id="fpsSelect" defaultValue="30">
                          <option value="24">24</option>
                          <option value="30">30</option>
                          <option value="60">60</option>
                        </select>
                      </div>
                    </div>

                    <label htmlFor="formatSelect">Format</label>
                    <select id="formatSelect" defaultValue="mkv">
                      <option value="mkv">MKV (Forced)</option>
                    </select>
                  </section>

                  <section className="rig-block">
                    <h3>Webcam rig</h3>

                    <div className="slider-line">
                      <label htmlFor="webcamSizeRange">Webcam size</label>
                      <input id="webcamSizeRange" type="range" min="12" max="70" defaultValue="24" />
                      <output id="webcamSizeValue">24%</output>
                    </div>

                    <label htmlFor="webcamShapeSelect">Webcam shape</label>
                    <select id="webcamShapeSelect" defaultValue="rounded">
                      <option value="rounded">Rounded Rectangle</option>
                      <option value="circle">Circle</option>
                    </select>

                    <label className="inline-toggle">
                      <input id="cameraEnabledToggle" type="checkbox" defaultChecked />
                      Camera on
                    </label>

                    <label className="inline-toggle">
                      <input id="mirrorToggle" type="checkbox" defaultChecked />
                      Mirror webcam
                    </label>

                    <button id="resetWebcamBtn" className="btn btn-full">
                      Reset Webcam
                    </button>
                  </section>

                  <section className="rig-block rig-screen">
                    <h3>Screen rig</h3>

                    <label htmlFor="screenFitSelect">Screen fit mode</label>
                    <select id="screenFitSelect" defaultValue="contain">
                      <option value="contain">Contain (No Crop)</option>
                      <option value="cover">Cover (Fill + Crop)</option>
                      <option value="stretch">Stretch</option>
                    </select>

                    <div className="slider-line">
                      <label htmlFor="screenScaleRange">Screen zoom</label>
                      <input id="screenScaleRange" type="range" min="50" max="200" defaultValue="100" />
                      <output id="screenScaleValue">100%</output>
                    </div>

                    <div className="slider-line">
                      <label htmlFor="screenXRange">Screen X position</label>
                      <input id="screenXRange" type="range" min="-50" max="50" defaultValue="0" />
                      <output id="screenXValue">0%</output>
                    </div>

                    <div className="slider-line">
                      <label htmlFor="screenYRange">Screen Y position</label>
                      <input id="screenYRange" type="range" min="-50" max="50" defaultValue="0" />
                      <output id="screenYValue">0%</output>
                    </div>

                    <button id="resetScreenBtn" className="btn btn-full">
                      Reset Screen
                    </button>
                  </section>
                </div>
              </div>
            </details>

            <details className="inspector-panel disclosure-panel demo-panel">
              <summary className="disclosure-summary">
                <div className="summary-main">
                  <p className="section-kicker">Product Demos</p>
                  <h2>Auto-focus engine</h2>
                </div>

                <div className="summary-side">
                  <span id="demoSummary" className="panel-summary" data-tone="warn">
                    disconnected
                  </span>
                  <span className="summary-arrow" aria-hidden="true"></span>
                </div>
              </summary>

              <div className="disclosure-body">
                <div className="panel-intro panel-intro-compact">
                  <p className="section-copy">
                    Keep this secondary unless you are recording guided walkthroughs or product
                    demos.
                  </p>
                </div>

                <label className="inline-toggle inline-toggle-wide">
                  <input id="demoModeToggle" type="checkbox" defaultChecked />
                  Enable demo mode
                </label>

                <div className="button-grid">
                  <button id="connectExtensionBtn" className="btn btn-secondary">
                    Connect Extension
                  </button>
                  <button id="demoResetBtn" className="btn">
                    Reset Demo
                  </button>
                </div>

                <p className="demo-status" data-state="idle" role="status" aria-live="polite">
                  <span className="status-label">Demo Status</span>
                  <span id="demoStatus">disconnected</span>
                </p>

                <div className="control-stack">
                  <div>
                    <label htmlFor="demoPresetSelect">Style preset</label>
                    <select id="demoPresetSelect" defaultValue="subtle">
                      <option value="subtle">Subtle Focus</option>
                      <option value="balanced">Balanced</option>
                      <option value="intense">Intense</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <label className="inline-toggle">
                    <input id="demoTriggerClickToggle" type="checkbox" defaultChecked />
                    Click trigger
                  </label>

                  <label className="inline-toggle">
                    <input id="demoTriggerTypeToggle" type="checkbox" defaultChecked />
                    Typing trigger
                  </label>

                  <div className="slider-line">
                    <label htmlFor="demoZoomStrengthRange">Zoom strength</label>
                    <input id="demoZoomStrengthRange" type="range" min="5" max="80" defaultValue="24" />
                    <output id="demoZoomStrengthValue">24%</output>
                  </div>

                  <div className="slider-line">
                    <label htmlFor="demoZoomDurationRange">Zoom duration</label>
                    <input id="demoZoomDurationRange" type="range" min="200" max="2000" defaultValue="700" />
                    <output id="demoZoomDurationValue">700ms</output>
                  </div>

                  <div className="slider-line">
                    <label htmlFor="demoCooldownRange">Cooldown</label>
                    <input id="demoCooldownRange" type="range" min="0" max="3000" defaultValue="650" />
                    <output id="demoCooldownValue">650ms</output>
                  </div>

                  <div className="slider-line">
                    <label htmlFor="demoTypingHoldRange">Typing hold</label>
                    <input id="demoTypingHoldRange" type="range" min="200" max="3000" defaultValue="1200" />
                    <output id="demoTypingHoldValue">1200ms</output>
                  </div>
                </div>
              </div>
            </details>
          </aside>
        </section>
      </main>

      <video id="screenVideo" playsInline muted></video>
      <video id="webcamVideo" playsInline muted></video>
    </>
  );
}
