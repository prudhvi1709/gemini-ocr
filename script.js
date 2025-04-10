// Extremely compressed script to fit in 200 lines
const els = {
  uploadArea: document.getElementById("upload-area"),
  fileInput: document.getElementById("file-input"),
  preview: document.getElementById("preview-container"),
  img: document.getElementById("image-preview"),
  processBtn: document.getElementById("process-btn"),
  clearBtn: document.getElementById("clear-btn"),
  loading: document.getElementById("loading-container"),
  error: document.getElementById("error-container"),
  errorMsg: document.getElementById("error-message"),
  results: document.getElementById("results-card"),
  table: document.getElementById("entity-table"),
  tbody: document.getElementById("entity-tbody"),
  downloadBtn: document.getElementById("download-csv"),
  noEntities: document.getElementById("no-entities"),
  textContainer: (() => {
    const c = document.createElement("div");
    c.className = "mb-4";
    c.id = "extracted-text-container";
    return c;
  })()
};

// State and utilities
let currentFile = null, entities = [];
const toggle = (el, show) => el.classList[show ? "remove" : "add"]("d-none"),
      setLoading = s => [toggle(els.loading, s), els.processBtn.disabled = s, els.clearBtn.disabled = s],
      showError = msg => [els.errorMsg.textContent = msg, toggle(els.error, true)];

// Event listeners for drag/drop and file upload
els.uploadArea.innerHTML = `
  <div class="text-center p-4 border-2 border-dashed">
    <i class="bi bi-cloud-arrow-up-fill text-primary" style="font-size:3rem"></i>
    <h5 class="mt-3">Drag & Drop or Click to Upload</h5>
    <p class="text-muted small">Formats: JPEG, PNG, GIF, WEBP</p>
  </div>`;
els.uploadArea.addEventListener("click", () => els.fileInput.click());
els.uploadArea.addEventListener("dragover", e => [e.preventDefault(), els.uploadArea.classList.add("dragging")]);
els.uploadArea.addEventListener("dragleave", () => els.uploadArea.classList.remove("dragging"));
els.uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  els.uploadArea.classList.remove("dragging");
  e.dataTransfer.files.length && handleUpload(e.dataTransfer.files[0]);
});
els.fileInput.addEventListener("change", e => e.target.files.length && handleUpload(e.target.files[0]));
els.processBtn.addEventListener("click", processImage);
els.clearBtn.addEventListener("click", () => {
  currentFile = null; entities = []; els.img.src = ""; els.fileInput.value = "";
  [els.preview, els.error, els.results].forEach(e => toggle(e, false));
  els.textContainer.innerHTML = ""; toggle(els.textContainer, false);
});
els.downloadBtn.addEventListener("click", () => {
  if (!entities.length) return showError("No data to download");
  const csv = ["Entity Name,Entity Type,Confidence"]
    .concat(entities.map(e => {
      const name = `"${(e.entityName || e.name || "Unknown").replace(/"/g, '""')}"`;
      return `${name},${e.entityType || e.type || "Unknown"},${e.confidenceScore || e.confidence || "N/A"}`;
    })).join("\n");
  const link = document.createElement("a");
  link.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  link.download = "extracted_entities.csv";
  link.click();
});

function handleUpload(file) {
  const types = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!types.includes(file.type)) return showError("Please upload a valid image (JPEG, PNG, GIF, or WEBP)");
  currentFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    els.img.src = e.target.result;
    toggle(els.preview, true);
    toggle(els.error, false);
  };
  reader.readAsDataURL(file);
}

async function processImage() {
  if (!currentFile) return showError("Please upload an image first");
  try {
    setLoading(true);
    [els.error, els.results].forEach(e => toggle(e, false));
    
    // Get token and prepare image
    const { token } = await fetch("https://llmfoundry.straive.com/token", {credentials: "include"}).then(r => r.json());
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(currentFile);
    });
    
    // API requests helper
    const apiRequest = async prompt => {
      const res = await fetch("https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.0-flash:generateContent", {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}:image-entity-extraction`},
        body: JSON.stringify({
          contents: [{parts: [
            {text: prompt},
            {inline_data: {mime_type: currentFile.type, data: base64.split(",")[1]}}
          ]}]
        })
      });
      if (!res.ok) throw new Error(`API request failed: ${res.status}`);
      return res.json();
    };
    
    // Make both API requests in parallel
    const [textData, entityData] = await Promise.all([
      apiRequest("Extract all text from this image. Maintain proper formatting and paragraph structure."),
      apiRequest("Extract all entities from this image. Return in JSON format with the following fields: entityName, entityType, confidenceScore. EntityType should be one of: PERSON, ORGANIZATION, LOCATION, DATE, PHONE, EMAIL, ADDRESS, ID_NUMBER, AMOUNT, OTHER. For each entity, provide a confidence score from 0 to 1.")
    ]);
    
    // Extract text and entities
    const text = textData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const content = entityData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("No content returned from API");
    
    // Parse entity JSON
    let json;
    try {
      json = JSON.parse(content);
    } catch (e) {
      const match = content.match(/```json([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
      json = match ? JSON.parse(match[0].replace(/```json|```/g, "").trim()) : null;
      if (!json) throw new Error("Could not parse JSON from API response");
    }
    
    // Process response and display results
    entities = Array.isArray(json) ? json : (json.entities && Array.isArray(json.entities) ? json.entities : []);
    
    // Display text
    els.textContainer.innerHTML = `
      <div class="col-12"><div class="card shadow-sm mb-4">
        <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h4 class="mb-0"><i class="bi bi-file-text me-2"></i>Extracted Text</h4>
          <button id="copy-text-btn" class="btn btn-light btn-sm"><i class="bi bi-clipboard me-2"></i>Copy</button>
        </div>
        <div class="card-body"><div style="white-space:pre-wrap">${text || "No text extracted"}</div></div>
      </div></div>`;

    // Get the right column that's already in the HTML
    const rightColumn = document.getElementById('right-column');

    // Clear the right column before adding new content
    rightColumn.innerHTML = '';

    // Place the textContainer inside right column
    els.textContainer.className = "mb-3"; // Adjust classes for proper spacing
    rightColumn.appendChild(els.textContainer);
    toggle(els.textContainer, true);

    // Place the results card (entity table) below the text in right column
    els.results.className = "mb-3"; // Reset classes to just have margin bottom
    rightColumn.appendChild(els.results);
    toggle(els.results, true);

    // Add copy functionality
    const copyBtn = els.textContainer.querySelector("#copy-text-btn");
    copyBtn.onclick = () => navigator.clipboard.writeText(text).then(() => {
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Copied!';
      setTimeout(() => copyBtn.innerHTML = orig, 2000);
    });
    
    // Display entities
    toggle(els.noEntities, !entities.length);
    toggle(els.table, entities.length > 0);
    els.tbody.innerHTML = entities.map((e, i) => {
      const conf = e.confidenceScore || e.confidence || "N/A";
      const formatted = typeof conf === "number" ? (conf * 100).toFixed(1) + "%" : conf;
      return `<tr>
        <td>${i + 1}</td>
        <td>${e.entityName || e.name || "Unknown"}</td>
        <td><span class="badge bg-secondary">${e.entityType || e.type || "Unknown"}</span></td>
        <td>${formatted}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error(err);
    showError(`Error: ${err.message}`);
  } finally {
    setLoading(false);
  }
}