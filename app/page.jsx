import RecorderBootstrap from "./RecorderBootstrap";

export default function Page() {
  return (
    <>
      <RecorderBootstrap />
      <div className="backdrop-glow" aria-hidden="true"></div>
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="kicker">Flight Deck Recorder</p>
            <h1>Frameforge Console</h1>
          </div>
          <p className="subtitle">Screen + webcam + microphone capture with cockpit controls.</p>
        </header>

        <section className="workspace">
          <div className="stage-wrap">
            <div className="stage-toolbar">
              <div className="stage-meta">
                <span className="stage-dot"></span>
                <span>Program Monitor</span>
              </div>
              <button id="togglePanelBtn" className="btn btn-ghost">
                Focus Preview
              </button>
            </div>
            <div className="stage-frame">
              <canvas id="compositeCanvas" width="1280" height="720"></canvas>
            </div>
            <p className="hint">Drag face-cam to move. Drag its bottom-right corner to resize.</p>
          </div>

          <aside className="controls">
            <div className="control-card">
              <h2>Record Flow</h2>
              <p className="panel-label">Capture System</p>
              <div className="button-grid">
                <button id="startSourcesBtn" className="btn btn-primary">
                  Start Sources
                </button>
                <button id="stopSourcesBtn" className="btn" disabled>
                  Stop Sources
                </button>
              </div>
              <button id="replaceScreenBtn" className="btn btn-secondary">
                Replace Screen
              </button>

              <p className="panel-label">Recorder</p>
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
            </div>

            <div className="control-card">
              <h2>Telemetry</h2>
              <div className="status-grid">
                <p className="status-pill">
                  <span className="status-label">Sources</span>
                  <span id="sourcesStatus">idle</span>
                </p>
                <p className="status-pill">
                  <span className="status-label">Recording</span>
                  <span id="recordingStatus">idle</span>
                </p>
                <p className="status-pill">
                  <span className="status-label">Started At</span>
                  <span id="recordingStartTime">--:--:--</span>
                </p>
                <p className="status-pill">
                  <span className="status-label">Elapsed</span>
                  <span id="elapsedTime">00:00:00</span>
                </p>
              </div>
            </div>

            <div className="control-card settings-section rig-hub">
              <h2>Rig Console</h2>
              <div className="rig-grid">
                <section className="rig-block">
                  <h3>Output Bus</h3>
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
                  <h3>Webcam Rig</h3>
                  <div className="slider-line">
                    <label htmlFor="webcamSizeRange">Webcam Size</label>
                    <input id="webcamSizeRange" type="range" min="12" max="70" defaultValue="24" />
                    <output id="webcamSizeValue">24%</output>
                  </div>

                  <label htmlFor="webcamShapeSelect">Webcam Shape</label>
                  <select id="webcamShapeSelect" defaultValue="rounded">
                    <option value="rounded">Rounded Rectangle</option>
                    <option value="circle">Circle</option>
                  </select>

                  <label className="inline-toggle">
                    <input id="mirrorToggle" type="checkbox" defaultChecked />
                    Mirror Webcam
                  </label>

                  <button id="resetWebcamBtn" className="btn">
                    Reset Webcam
                  </button>
                </section>

                <section className="rig-block rig-screen">
                  <h3>Screen Rig</h3>
                  <label htmlFor="screenFitSelect">Screen Fit Mode</label>
                  <select id="screenFitSelect" defaultValue="contain">
                    <option value="contain">Contain (No Crop)</option>
                    <option value="cover">Cover (Fill + Crop)</option>
                    <option value="stretch">Stretch</option>
                  </select>

                  <div className="slider-line">
                    <label htmlFor="screenScaleRange">Screen Zoom</label>
                    <input id="screenScaleRange" type="range" min="50" max="200" defaultValue="100" />
                    <output id="screenScaleValue">100%</output>
                  </div>

                  <div className="slider-line">
                    <label htmlFor="screenXRange">Screen X Position</label>
                    <input id="screenXRange" type="range" min="-50" max="50" defaultValue="0" />
                    <output id="screenXValue">0%</output>
                  </div>

                  <div className="slider-line">
                    <label htmlFor="screenYRange">Screen Y Position</label>
                    <input id="screenYRange" type="range" min="-50" max="50" defaultValue="0" />
                    <output id="screenYValue">0%</output>
                  </div>

                  <button id="resetScreenBtn" className="btn">
                    Reset Screen
                  </button>
                </section>
              </div>
            </div>
          </aside>
        </section>
      </main>

      <video id="screenVideo" playsInline muted></video>
      <video id="webcamVideo" playsInline muted></video>
    </>
  );
}
